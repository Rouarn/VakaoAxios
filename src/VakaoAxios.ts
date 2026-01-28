import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { VakaoInstanceConfig, VakaoInternalRequestConfig, VakaoInterceptors, VakaoRequestConfig } from './types';
import { CancelHandler } from './CancelHandler';

export class VakaoAxios {
  instance: AxiosInstance;
  interceptors?: VakaoInterceptors;
  cancelHandler: CancelHandler;

  constructor(config: VakaoInstanceConfig) {
    this.instance = axios.create(config);
    this.interceptors = config.interceptors;
    this.cancelHandler = new CancelHandler();

    // 1. 设置请求拦截器
    this.instance.interceptors.request.use(
      (config: VakaoInternalRequestConfig) => {
        // 默认逻辑: 取消重复请求
        if (config.cancelDuplicateRequest !== false) {
          this.cancelHandler.addPending(config);
        }

        // 应用实例拦截器
        if (this.interceptors?.requestInterceptor) {
          config = this.interceptors.requestInterceptor(config);
        }
        return config;
      },
      (error: unknown) => {
        if (this.interceptors?.requestInterceptorCatch) {
            return this.interceptors.requestInterceptorCatch(error);
        }
        return Promise.reject(error);
      }
    );

    // 2. 设置响应拦截器
    this.instance.interceptors.response.use(
      (res: AxiosResponse) => {
        const config = res.config as VakaoInternalRequestConfig;
        
        // 从挂起映射中移除 (成功)
        if (config.cancelDuplicateRequest !== false) {
           this.cancelHandler.clearPending(config);
        }

        if (this.interceptors?.responseInterceptor) {
          res = this.interceptors.responseInterceptor(res);
        }
        return res;
      },
      async (error: unknown) => {
        const axiosError = error as AxiosError;
        const config = axiosError.config as VakaoInternalRequestConfig;
        
        // 从挂起映射中移除 (错误)
        if (config && config.cancelDuplicateRequest !== false) {
           this.cancelHandler.clearPending(config);
        }

        // 重试逻辑
        if (config && config.retry && config.retry > 0) {
            config.retryCount = config.retryCount || 0;
            if (config.retryCount < config.retry) {
                config.retryCount++;
                const delay = config.retryDelay || 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.instance(config);
            }
        }

        if (this.interceptors?.responseInterceptorCatch) {
           return this.interceptors.responseInterceptorCatch(error);
        }
        return Promise.reject(error);
      }
    );
  }

  request<T = unknown>(config: VakaoRequestConfig): Promise<T> {
    return new Promise((resolve, reject) => {
      this.instance.request<any, T>(config)
        .then((res) => {
          resolve(res);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  get<T = unknown>(config: VakaoRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'GET' });
  }

  post<T = unknown>(config: VakaoRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'POST' });
  }

  delete<T = unknown>(config: VakaoRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'DELETE' });
  }

  put<T = any>(config: VakaoRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'PUT' });
  }

  patch<T = any>(config: VakaoRequestConfig): Promise<T> {
    return this.request({ ...config, method: 'PATCH' });
  }
  
  cancelAll() {
      this.cancelHandler.removeAllPending();
  }
}
