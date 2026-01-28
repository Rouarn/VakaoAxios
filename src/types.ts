import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

export interface VakaoRequestConfig extends AxiosRequestConfig {
  /**
   * 请求重试次数
   * @default 0
   */
  retry?: number;
  /**
   * 请求重试延迟 (毫秒)
   * @default 1000
   */
  retryDelay?: number;
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

export interface VakaoResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// 扩展 InternalAxiosRequestConfig 以包含我们的自定义属性
export interface VakaoInternalRequestConfig extends InternalAxiosRequestConfig {
  retry?: number;
  retryDelay?: number;
  retryCount?: number; // 内部使用的计数器
  requestKey?: string;
  cancelDuplicateRequest?: boolean;
}

export interface VakaoInterceptors {
  requestInterceptor?: (config: VakaoInternalRequestConfig) => VakaoInternalRequestConfig;
  requestInterceptorCatch?: (error: any) => any;
  responseInterceptor?: (res: AxiosResponse) => AxiosResponse;
  responseInterceptorCatch?: (error: any) => any;
}

export interface VakaoInstanceConfig extends VakaoRequestConfig {
  interceptors?: VakaoInterceptors;
}
