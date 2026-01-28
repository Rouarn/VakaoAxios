import { createVakaoAxios } from '../src';
import type { FlatRequestInstance } from '../src';
import MockAdapter from 'axios-mock-adapter';

interface ResponseData<T = any> {
  code: number;
  data: T;
  msg: string;
}

describe('FlatRequest', () => {
  let request: FlatRequestInstance;
  let mock: MockAdapter;

  beforeEach(() => {
    request = createVakaoAxios<ResponseData>(
      { 
        baseURL: 'http://api.example.com',
        cancelDuplicateRequest: true
      },
      {
        isBackendSuccess: (response) => {
          return response.data.code === 200;
        },
        onBackendFail: async (response) => {
          console.log('Backend failed:', response.data.msg);
        },
        transformBackendResponse: (response) => {
          return response.data.data;
        },
        onError: (error) => {
          console.error('Global error:', error);
        }
      }
    );
    mock = new MockAdapter(request.instance);
  });

  afterEach(() => {
    mock.reset();
  });

  it('应该成功获取并转换数据', async () => {
    const responseData = { code: 200, data: { id: 1, name: 'test' }, msg: 'success' };
    mock.onGet('/users/1').reply(200, responseData);

    const data = await request.get<{ id: number; name: string }>('/users/1');
    expect(data).toEqual(responseData.data);
  });

  it('业务失败时应该抛出错误', async () => {
    const responseData = { code: 400, data: null, msg: 'error' };
    mock.onGet('/error').reply(200, responseData);

    await expect(request.get('/error')).rejects.toThrow('Backend Request Failed');
  });

  it('HTTP错误时应该触发 onError', async () => {
    mock.onGet('/http-error').reply(500);

    await expect(request.get('/http-error')).rejects.toThrow();
  });

  it('应该支持自定义请求拦截器', async () => {
    const customRequest = createVakaoAxios(
      { baseURL: 'http://api.example.com' },
      {
        isBackendSuccess: (res) => res.status === 200,
        onBackendFail: () => {},
        transformBackendResponse: (res) => res.data,
        onError: () => {},
        onRequest: (config) => {
          config.headers['X-Custom'] = 'foobar';
          return config;
        }
      }
    );
    const customMock = new MockAdapter(customRequest.instance);
    
    customMock.onGet('/interceptor').reply(config => {
      if (config.headers?.['X-Custom'] === 'foobar') {
        return [200, { ok: true }];
      }
      return [400, { ok: false }];
    });

    const data = await customRequest.get('/interceptor');
    expect(data).toEqual({ ok: true });
  });
});
