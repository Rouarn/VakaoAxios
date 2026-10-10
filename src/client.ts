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
/** 默认业务成功码；后端约定不同（0 / 1 / "00000" 等）时通过 contract.successCode 覆盖 */
const DEFAULT_SUCCESS_CODE = 200;

/**
 * 默认契约：仅约定成功信封的判定与解包，不涉及任何错误文案
 * { code, message, timestamp, data }（nestjs-template 统一响应信封）
 */
const defaultContract: Required<ResponseContract> = {
  successCode: DEFAULT_SUCCESS_CODE,
  unwrap: body => (body as Record<string, unknown> | null)?.data,
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

  // 契约只管成功信封的判定与解包；报错时原始响应体随 RequestError 抛出，文案由使用方在 onError 处理
  const contract: Required<ResponseContract> = {
    successCode: userContract?.successCode ?? defaultContract.successCode,
    unwrap: userContract?.unwrap ?? defaultContract.unwrap,
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

      // HTTP 成功但业务失败：不提取任何文案，完整响应体在 error.response.data，交由使用方解释
      const error = new RequestError({
        type: "business",
        code: typeof body?.code === "number" ? body.code : -1,
        message: "",
        data: body?.data,
        response,
      });
      notifyError(c, error);
      throw error;
    },
    async (err: AxiosError) => {
      const c = err.config as InternalConfig | undefined;
      if (c) settleRequest(c);

      // 取消（手动取消 / 重复请求取消）：安静抛出，不触发 onError，文案由调用方自行解释
      if (axios.isCancel(err) || err.code === "ERR_CANCELED") {
        throw new RequestError({
          type: "cancel",
          message: err.message,
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

  /**
   * 归一化 axios 错误为 RequestError
   *
   * 库只归类错误并保留原始信息，不提取、不捏造任何用户可见文案：
   * message 一律为 axios 原始信息；http 错误的完整响应体在 error.response.data，
   * 由使用方在 onError 中按 type 与响应体自行决定提示内容。
   */
  function normalizeError(err: AxiosError): RequestError {
    if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      return new RequestError({
        type: "timeout",
        message: err.message,
        code: 0,
      });
    }
    const { response } = err;
    if (!response) {
      return new RequestError({
        type: "network",
        message: err.message,
        code: 0,
      });
    }
    const body = response.data as Record<string, unknown> | undefined;
    return new RequestError({
      type: "http",
      code: response.status,
      message: err.message,
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
