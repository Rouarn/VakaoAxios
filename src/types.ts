import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { RequestError } from "./error";

/**
 * 单次请求选项（自定义选项 + axios 透传配置，如 headers / responseType / signal / onUploadProgress）
 */
export type RequestOptions = Omit<
  AxiosRequestConfig,
  "url" | "method" | "data" | "params"
> & {
  /** 是否计入全局 loading（默认 false） */
  loading?: boolean;
  /** 静默模式：不触发全局 onError（默认 false） */
  silent?: boolean;
  /** 重复请求取消：同 key 的后发请求取消先前请求（默认 true） */
  dedupe?: boolean;
  /** 401 时不触发刷新重试，登录/刷新接口自身使用（默认 false） */
  skipAuthRetry?: boolean;
  /** 自定义去重 key，默认按 method + url + params + data 生成 */
  requestKey?: string;
};

/** 内部请求配置（请求选项 + axios 配置） */
export type InternalRequestConfig = AxiosRequestConfig & RequestOptions;

/**
 * 响应契约（默认适配 nestjs-template 信封，可覆盖）
 *
 * 仅约定成功响应的结构，不涉及任何错误文案：
 * 接口报错时原始错误体在 RequestError.response.data 中，由使用方在 onError 自行解释
 */
export interface ResponseContract {
  /**
   * 业务成功码，默认 200。
   * 不同后端约定不同（如 0 / 1 / "00000"），按响应体中 code 的实际类型与取值设置；
   * 判定为严格相等（===），数字 200 与字符串 "200" 不互通
   */
  successCode?: number | string;
  /** 从响应信封中取业务数据，默认 (body) => body.data */
  unwrap?: (body: unknown) => unknown;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** 返回完整 Authorization 头值（含 Bearer 前缀）；返回空则不注入 */
  getToken?: () => string | null | undefined;
  /**
   * 401 时触发（单例：并发 401 只执行一次，其余请求等待结果）。
   * 返回 true 表示刷新成功，库自动重放原请求；返回 false / 抛错视为失败。
   * 参数 client 为当前实例，用于发起刷新请求（配合 skipAuthRetry 防循环）。
   */
  onRefresh?: (client: RequestClient) => Promise<boolean>;
  /** 刷新失败回调（清 token、跳登录等） */
  onRefreshFailed?: () => void | Promise<void>;
}

/**
 * createClient 配置项
 */
export interface ClientConfig {
  // ---- axios 原生透传 ----
  baseURL?: string;
  /** 默认 10000 */
  timeout?: number;
  headers?: AxiosRequestConfig["headers"];
  withCredentials?: boolean;

  /** 响应契约：仅约定成功信封的成功码与解包方式；错误文案请在 onError 中按 error.response.data 自行处理 */
  contract?: ResponseContract;

  /** 认证配置 */
  auth?: AuthConfig;

  /** 全局 loading：内置计数器，pending=true 表示第一个 loading 请求开始，false 表示最后一个结束 */
  onLoading?: (pending: boolean) => void;
  /**
   * 统一错误出口；silent: true 的请求不触发；cancel 类型不触发。
   * 库不提供任何用户可见文案，完整错误信息挂在 error 上：
   * type / code / data / response（原始响应体取 error.response.data），文案由使用方在此解析
   */
  onError?: (error: RequestError) => void;
}

/**
 * 请求客户端实例
 */
export interface RequestClient {
  get<T = unknown>(
    url: string,
    params?: object,
    options?: RequestOptions,
  ): Promise<T>;
  delete<T = unknown>(
    url: string,
    params?: object,
    options?: RequestOptions,
  ): Promise<T>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  patch<T = unknown>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  upload<T = unknown>(
    url: string,
    formData: FormData,
    options?: RequestOptions,
  ): Promise<T>;
  download(
    url: string,
    params?: object,
    options?: RequestOptions,
  ): Promise<Blob>;
  /** 取消所有进行中（含未发出）的请求 */
  cancelAll(): void;
  /** 原始 axios 实例（逃生舱） */
  instance: AxiosInstance;
}
