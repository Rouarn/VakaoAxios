import axios, { HttpStatusCode } from "axios";
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { CancelHandler } from "./cancel";
import { RequestError } from "./error";
import type {
  ClientConfig,
  RequestClient,
  RequestOptions,
  ResponseContract,
} from "./types";

/** 内部请求配置：axios 配置 + 库自定义选项 + 内部状态位 */
type InternalConfig = InternalAxiosRequestConfig & {
  loading?: boolean;
  silent?: boolean;
  dedupe?: boolean;
  skipAuthRetry?: boolean;
  requestKey?: string;
  /** 内部字段：上传请求（自动处理 Content-Type） */
  __isUpload?: boolean;
  /** 内部字段：刷新后重放标记，防止 401 死循环 */
  __isRetryAfterRefresh?: boolean;
};

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_SUCCESS_CODE = 200;

/** 收集字符串（支持 string 与 string[]，用于提取顶层 message） */
function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStrings(item, output));
  }
}

interface ValidationErrorItem {
  field?: unknown;
  messages?: unknown;
}

/**
 * 从 data.validationErrors 提取用户可见的校验错误文案
 *
 * 结构：[{ field: string, messages: string[] }]
 * 只取 messages 内容，绝不向用户暴露 field 等内部字段名
 */
function extractValidationMessages(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as Record<string, unknown>).validationErrors;
  if (!Array.isArray(list)) return [];

  const result: string[] = [];
  list.forEach((item: ValidationErrorItem) => {
    if (item && typeof item === "object") collectStrings(item.messages, result);
  });
  return result;
}

/**
 * 默认错误文案提取
 *
 * - 顶层 message（string | string[]）作为主消息
 * - data.validationErrors 中的 messages 作为编号详情列表（不显示 field）
 * - 不递归 data 的其他内容，避免内部字段名泄露给用户
 */
function defaultErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "请求失败";
  const record = body as Record<string, unknown>;

  const mainParts: string[] = [];
  collectStrings(record.message, mainParts);
  const main = mainParts.join("；");

  const validationMessages = extractValidationMessages(record.data);
  if (validationMessages.length === 0) return main || "请求失败";

  const detail = validationMessages
    .map((text, index) => `${index + 1}. ${text}`)
    .join("\n");
  return main ? `${main}\n原因：\n${detail}` : `原因：\n${detail}`;
}

/** 默认契约：nestjs-template 统一响应信封 { code, message, timestamp, data } */
const defaultContract: Required<ResponseContract> = {
  successCode: DEFAULT_SUCCESS_CODE,
  unwrap: body => (body as Record<string, unknown> | null)?.data,
  errorMessage: defaultErrorMessage,
};

/**
 * 创建请求客户端
 *
 * 内置能力：后端信封解包、token 注入、401 单例刷新并重放原请求、
 * 重复请求取消、全局 loading 计数、统一错误出口
 */
export function createClient(config: ClientConfig = {}): RequestClient {
  const {
    contract: userContract,
    auth,
    onLoading,
    onError,
    ...axiosConfig
  } = config;

  const contract: Required<ResponseContract> = {
    successCode: userContract?.successCode ?? defaultContract.successCode,
    unwrap: userContract?.unwrap ?? defaultContract.unwrap,
    errorMessage: userContract?.errorMessage ?? defaultContract.errorMessage,
  };

  const instance: AxiosInstance = axios.create({
    timeout: DEFAULT_TIMEOUT,
    ...axiosConfig,
  });
  const cancelHandler = new CancelHandler();

  /* ===================== 全局 Loading 计数 ===================== */
  let loadingCount = 0;
  const startLoading = (): void => {
    loadingCount += 1;
    if (loadingCount === 1) onLoading?.(true);
  };
  const stopLoading = (): void => {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) onLoading?.(false);
  };

  /** 请求终结统一处理：清理去重登记 + 关闭 loading */
  const settleRequest = (c: InternalConfig): void => {
    if (c.dedupe !== false) cancelHandler.clearPending(c);
    if (c.loading) stopLoading();
  };

  /** 统一错误出口：cancel 与 silent 不触发 */
  const notifyError = (
    c: InternalConfig | undefined,
    error: RequestError,
  ): void => {
    if (error.type === "cancel" || c?.silent) return;
    onError?.(error);
  };

  /* ===================== 401 单例刷新 ===================== */
  let refreshingPromise: Promise<boolean> | null = null;

  const runRefresh = (): Promise<boolean> => {
    if (!refreshingPromise) {
      const task = (async (): Promise<boolean> => {
        let ok = false;
        try {
          ok = Boolean(await auth?.onRefresh?.(client));
        } catch {
          ok = false;
        }
        if (!ok) {
          try {
            await auth?.onRefreshFailed?.();
          } catch {
            /* 刷新失败回调中的异常不影响错误出口 */
          }
        }
        return ok;
      })();
      refreshingPromise = task;
      const reset = (): void => {
        if (refreshingPromise === task) refreshingPromise = null;
      };
      task.then(reset, reset);
    }
    return refreshingPromise;
  };

  /* ===================== 拦截器 ===================== */
  instance.interceptors.request.use(rawConfig => {
    const c = rawConfig as InternalConfig;

    // 1. 重复请求取消（默认开启）
    if (c.dedupe !== false) cancelHandler.addPending(c);

    // 2. 注入 token
    const token = auth?.getToken?.();
    if (token) c.headers.set("Authorization", token);

    // 3. 上传请求
    if (c.__isUpload) c.headers.set("Content-Type", "multipart/form-data");

    // 4. 全局 loading
    if (c.loading) startLoading();

    return c;
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      const c = response.config as InternalConfig;
      settleRequest(c);

      // 下载/二进制：直接返回原始数据
      if (c.responseType === "blob" || c.responseType === "arraybuffer") {
        return response.data as AxiosResponse;
      }

      const body = response.data as Record<string, unknown> | null;
      if (
        body &&
        typeof body === "object" &&
        body.code === contract.successCode
      ) {
        return contract.unwrap(body) as AxiosResponse;
      }

      // HTTP 成功但业务失败
      const error = new RequestError({
        type: "business",
        code: typeof body?.code === "number" ? body.code : -1,
        message: contract.errorMessage(body),
        data: body?.data,
        response,
      });
      notifyError(c, error);
      throw error;
    },
    async (err: AxiosError) => {
      const c = err.config as InternalConfig | undefined;
      if (c) settleRequest(c);

      // 取消（手动取消 / 重复请求取消）：安静抛出，不触发 onError
      if (axios.isCancel(err) || err.code === "ERR_CANCELED") {
        throw new RequestError({
          type: "cancel",
          message: "请求已取消",
          code: 0,
        });
      }

      // 401：单例刷新 + 重放原请求
      if (
        err.response?.status === HttpStatusCode.Unauthorized &&
        c &&
        !c.skipAuthRetry &&
        !c.__isRetryAfterRefresh &&
        auth?.onRefresh
      ) {
        const ok = await runRefresh();
        if (ok) {
          c.__isRetryAfterRefresh = true;
          return instance.request(c);
        }
      }

      const error = normalizeError(err);
      notifyError(c, error);
      throw error;
    },
  );

  /** 归一化 axios 错误为 RequestError */
  function normalizeError(err: AxiosError): RequestError {
    if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      return new RequestError({
        type: "timeout",
        message: "请求超时，请稍后重试",
        code: 0,
      });
    }
    const { response } = err;
    if (!response) {
      return new RequestError({
        type: "network",
        message: "网络连接异常，请检查网络",
        code: 0,
      });
    }
    const body = response.data as Record<string, unknown> | undefined;
    return new RequestError({
      type: "http",
      code: response.status,
      message: contract.errorMessage(body),
      data: body?.data,
      response,
    });
  }

  /* ===================== 方法封装 ===================== */
  function buildConfig(
    method: string,
    url: string,
    payload: unknown,
    isQuery: boolean,
    options?: RequestOptions,
  ): InternalConfig {
    const {
      loading,
      silent,
      dedupe,
      skipAuthRetry,
      requestKey,
      ...axiosOptions
    } = options ?? {};
    return {
      ...axiosOptions,
      url,
      method,
      loading,
      silent,
      dedupe,
      skipAuthRetry,
      requestKey,
      ...(isQuery ? { params: payload } : { data: payload }),
    } as InternalConfig;
  }

  const send = <T>(c: InternalConfig): Promise<T> =>
    instance.request<unknown, T>(c as AxiosRequestConfig);

  const withQuery =
    (method: string) =>
    <T>(url: string, params?: object, options?: RequestOptions): Promise<T> =>
      send<T>(buildConfig(method, url, params, true, options));

  const withData =
    (method: string) =>
    <T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> =>
      send<T>(buildConfig(method, url, data, false, options));

  const client: RequestClient = {
    instance,
    get: withQuery("GET"),
    delete: withQuery("DELETE"),
    post: withData("POST"),
    put: withData("PUT"),
    patch: withData("PATCH"),
    upload: <T>(
      url: string,
      formData: FormData,
      options?: RequestOptions,
    ): Promise<T> => {
      const c = buildConfig("POST", url, formData, false, options);
      c.__isUpload = true;
      return send<T>(c);
    },
    download: (
      url: string,
      params?: object,
      options?: RequestOptions,
    ): Promise<Blob> =>
      send<Blob>(
        buildConfig("GET", url, params, true, {
          ...options,
          responseType: "blob",
        }),
      ),
    cancelAll: () => cancelHandler.removeAllPending(),
  };

  return client;
}
