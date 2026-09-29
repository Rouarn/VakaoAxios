import type { AxiosResponse } from 'axios';

/**
 * 请求错误类型
 * - business: HTTP 成功但业务 code 非成功码
 * - http: HTTP 错误（4xx/5xx，含 401）
 * - network: 网络异常（断网/DNS 失败等无响应场景）
 * - timeout: 请求超时
 * - cancel: 请求被取消（手动取消或重复请求取消）
 */
export type RequestErrorType = 'business' | 'http' | 'network' | 'timeout' | 'cancel';

export interface RequestErrorOptions {
  type: RequestErrorType;
  message: string;
  /** HTTP 状态码或业务 code */
  code: number;
  /** 后端错误体的 data 字段（校验失败时的字段级错误） */
  data?: unknown;
  response?: AxiosResponse;
}

/**
 * 统一请求错误：全链路只有一种错误类型
 */
export class RequestError extends Error {
  readonly type: RequestErrorType;
  readonly code: number;
  readonly data?: unknown;
  readonly response?: AxiosResponse;

  constructor(options: RequestErrorOptions) {
    super(options.message);
    this.name = 'RequestError';
    this.type = options.type;
    this.code = options.code;
    this.data = options.data;
    this.response = options.response;
    // 修复 ES5 继承内建类的原型链问题
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}
