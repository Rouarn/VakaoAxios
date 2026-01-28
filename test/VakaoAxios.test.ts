import { createVakaoAxios, VakaoAxios } from '../src';
import MockAdapter from 'axios-mock-adapter';
import { AxiosResponse } from 'axios';

describe('VakaoAxios', () => {
  let vakao: VakaoAxios;
  let mock: MockAdapter;

  beforeEach(() => {
    vakao = createVakaoAxios({ baseURL: 'http://api.example.com' });
    mock = new MockAdapter(vakao.instance);
  });

  afterEach(() => {
    mock.reset();
  });

  it('应该成功获取数据', async () => {
    const data = { id: 1, name: 'test' };
    mock.onGet('/users/1').reply(200, data);

    const response = await vakao.get<AxiosResponse>({ url: '/users/1' });
    expect(response.data).toEqual(data);
  });

  it('失败时应该重试', async () => {
    mock.onGet('/retry').replyOnce(500).onGet('/retry').reply(200, { success: true });
    
    const response = await vakao.get<AxiosResponse>({ 
        url: '/retry', 
        retry: 1, 
        retryDelay: 100 
    });
    
    expect(response.data).toEqual({ success: true });
  });

  it('应该支持自定义拦截器', async () => {
    const customVakao = createVakaoAxios({
        baseURL: 'http://api.example.com',
        interceptors: {
            requestInterceptor: (config) => {
                config.headers = config.headers || {};
                config.headers['X-Custom'] = 'foobar';
                return config;
            }
        }
    });
    const customMock = new MockAdapter(customVakao.instance);
    customMock.onGet('/interceptor').reply(config => {
        if (config.headers?.['X-Custom'] === 'foobar') {
            return [200, { ok: true }];
        }
        return [400, { ok: false }];
    });

    const response = await customVakao.get<AxiosResponse>({ url: '/interceptor' });
    expect(response.data).toEqual({ ok: true });
  });
});
