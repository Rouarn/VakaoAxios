import type {
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosInstance
} from 'axios';

/**
 * 业务响应数据的通用结构
 * T 为实际的数据类型
 */
export interface IResponse<T = any> {
  code: number | string;
  data: T;
  msg: string;
  message?: string;
}

/**
 * 自定义请求选项
 */
export interface RequestOptions<ResponseData = any> {
  /**
   * 判断后端业务逻辑是否成功
   * @example
   * isBackendSuccess: (response) => response.data.code === 200
   */
  isBackendSuccess: (response: AxiosResponse<ResponseData>) => boolean;
  
  /**
   * 当后端业务逻辑失败时的回调
   * @example
   * onBackendFail: (response) => {
   *   if (response.data.code === 401) logout();
   * }
   */
  onBackendFail: (response: AxiosResponse<ResponseData>, instance: AxiosInstance) => Promise<void> | void;
  
  /**
   * 转换后端响应数据，返回最终给用户的数据
   * @example
   * transformBackendResponse: (response) => response.data.data
   */
  transformBackendResponse: (response: AxiosResponse<ResponseData>) => any | Promise<any>;
  
  /**
   * 当发生错误（网络错误、超时、业务失败等）时的回调
   */
  onError: (error: RequestError) => void | Promise<void>;
  
  /**
   * 请求拦截器 hook
   */
  onRequest?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
}

/**
 * 扩展的 Axios 请求配置
 */
export interface FlatRequestInstanceConfig<ResponseData = any> extends AxiosRequestConfig {
  /**
   * 用于取消请求的自定义 Key。如果未提供，将自动生成。
   */
  requestKey?: string;
  /**
   * 是否开启重复请求取消功能
   * @default true
   */
  cancelDuplicateRequest?: boolean;
}

/**
 * 内部使用的请求配置，包含 requestKey 等
 */
export interface FlatInternalRequestConfig extends InternalAxiosRequestConfig {
  requestKey?: string;
  cancelDuplicateRequest?: boolean;
}

/**
 * 请求错误类型
 */
export type RequestError = AxiosError | Error;

/**
 * 请求实例接口
 */
export interface FlatRequestInstance {
  instance: AxiosInstance;
  
  request<T = any>(config: AxiosRequestConfig): Promise<T>;
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  
  // 暴露原始 axios 实例以便特殊需求
  cancelAll(): void;
}
