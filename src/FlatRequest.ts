import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosError
} from 'axios';
import type {
  FlatRequestInstance,
  RequestOptions,
  FlatRequestInstanceConfig,
  FlatInternalRequestConfig
} from './types';
import { CancelHandler } from './CancelHandler';

/**
 * 创建扁平化请求实例
 * @param axiosConfig Axios 基础配置
 * @param options 自定义业务逻辑选项
 */
export function createVakaoAxios<ResponseData = any>(
  axiosConfig: FlatRequestInstanceConfig<ResponseData>,
  options: RequestOptions<ResponseData>
): FlatRequestInstance {
  const instance = axios.create(axiosConfig);
  const cancelHandler = new CancelHandler();

  // 请求拦截器
  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const flatConfig = config as FlatInternalRequestConfig;
      
      // 1. 处理重复请求取消
      if (flatConfig.cancelDuplicateRequest !== false) {
          cancelHandler.addPending(flatConfig);
      }

      // 2. 执行用户自定义的 onRequest
      if (options.onRequest) {
        // 用户 hook 可能返回新的 config，也可能直接修改 config
        const newConfig = await options.onRequest(flatConfig);
        return newConfig || flatConfig;
      }
      return flatConfig;
    },
    (error: unknown) => {
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    async (response: AxiosResponse<ResponseData>) => {
      const config = response.config as FlatInternalRequestConfig;
      // 移除 pending
      if (config.cancelDuplicateRequest !== false) {
          cancelHandler.clearPending(config);
      }

      // 1. 判断业务逻辑是否成功
      if (options.isBackendSuccess(response)) {
        // 2. 成功，进行数据转换
        return options.transformBackendResponse(response);
      } else {
        // 3. 业务逻辑失败
        await options.onBackendFail(response, instance);
        
        const error = new Error('Backend Request Failed');
        (error as any).response = response;
        (error as any).isBackendFail = true;
        
        // 调用 onError (可选，取决于是否希望业务失败也触发 onError)
        await options.onError(error);
        
        return Promise.reject(error);
      }
    },
    async (error: AxiosError) => {
      const config = error.config as FlatInternalRequestConfig | undefined;
      if (config && config.cancelDuplicateRequest !== false) {
        cancelHandler.clearPending(config);
      }

      // 处理取消请求的错误，通常不需要报错
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      // 调用全局错误处理
      await options.onError(error);
      
      return Promise.reject(error);
    }
  );

  // 封装常用方法
  const requestMethod = async <T = any>(config: AxiosRequestConfig): Promise<T> => {
    return instance.request<any, T>(config);
  };

  const get = <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return requestMethod<T>({ ...config, url, method: 'GET' });
  };

  const post = <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return requestMethod<T>({ ...config, url, data, method: 'POST' });
  };

  const put = <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return requestMethod<T>({ ...config, url, data, method: 'PUT' });
  };

  const del = <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return requestMethod<T>({ ...config, url, method: 'DELETE' });
  };

  const patch = <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return requestMethod<T>({ ...config, url, data, method: 'PATCH' });
  };

  return {
    instance,
    request: requestMethod,
    get,
    post,
    put,
    delete: del,
    patch,
    cancelAll: () => cancelHandler.removeAllPending()
  };
}
