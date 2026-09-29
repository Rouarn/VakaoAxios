# @vakao-ui/axios

开箱即用、类型安全的 Axios 封装库（v1.0，不兼容 0.x）。内置后端信封解包、401 单例刷新并重放原请求、重复请求取消、全局 loading 计数与统一错误出口。

## 特性

- **开箱即用**：默认适配 `{ code, message, data, timestamp }` 响应信封，成功直接返回 `data`
- **扁平返回**：请求方法直接返回业务数据 `Promise<T>`，失败抛出统一的 `RequestError`
- **401 自愈**：`onRefresh` 单例刷新（并发 401 只刷一次），成功后自动重放原请求
- **重复请求取消**：同 key 的后发请求自动取消先前请求（AbortController）
- **类型安全**：完整的 TypeScript 泛型推断

## 安装

```bash
pnpm add @vakao-ui/axios axios
```

## 快速上手

```typescript
import { createClient, RequestError } from '@vakao-ui/axios';

export const request = createClient({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'X-Api-Version': '1' },

  auth: {
    // 返回完整 Authorization 头值；返回空则不注入
    getToken: () => {
      const token = localStorage.getItem('token');
      return token ? `Bearer ${token}` : undefined;
    },
    // 401 时触发（单例，并发请求共享同一次刷新）；返回 true 则自动重放原请求
    onRefresh: async (client) => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return false;
      try {
        const data = await client.post<{ accessToken: string }>(
          '/api/auth/refresh',
          { refreshToken },
          { skipAuthRetry: true, silent: true },
        );
        localStorage.setItem('token', data.accessToken);
        return true;
      } catch {
        return false;
      }
    },
    // 刷新失败回调（清 token、跳登录）
    onRefreshFailed: () => {
      localStorage.removeItem('token');
      location.href = '/login';
    },
  },

  // 全局 loading：内置计数器，首个 loading 请求开始 / 最后一个结束时触发
  onLoading: (pending) => (pending ? showLoading() : hideLoading()),
  // 统一错误出口；silent: true 的请求不触发
  onError: (error) => message.error(error.message),
});
```

## 使用

```typescript
interface User {
  id: string;
  name: string;
}

// 直接返回业务数据（已解包 data）
const user = await request.get<User>('/users/1');
const list = await request.get<User[]>('/users', { current: 1, size: 10 });
await request.post('/users', { name: 'Alice' });
await request.put(`/users/${user.id}`, { name: 'Bob' });
await request.delete(`/users/${user.id}`);

// 上传（自动处理 Content-Type: multipart/form-data）
const form = new FormData();
form.append('file', file);
const { url } = await request.upload<{ url: string }>('/upload', form);

// 下载（返回 Blob）
const blob = await request.download('/export', { id: 1 });

// 取消所有请求
request.cancelAll();
```

调用方错误处理：

```typescript
try {
  const user = await request.get<User>('/users/1');
} catch (error) {
  // 全局 onError 已提示，此处只做兜底或特殊逻辑
  if (error instanceof RequestError && error.type === 'cancel') return;
}
```

## API 参考

### `createClient(config): RequestClient`

#### ClientConfig

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `baseURL` / `timeout` / `headers` / `withCredentials` | axios 原生 | 透传 axios，`timeout` 默认 10000 |
| `contract.successCode` | `number` | 业务成功码，默认 `200` |
| `contract.unwrap` | `(body) => unknown` | 从信封取业务数据，默认 `body => body.data` |
| `contract.errorMessage` | `(body) => string` | 错误文案提取：顶层 `message`（支持 `string[]`）作为主消息，`data.validationErrors[].messages` 作为编号详情（不暴露 `field` 等内部字段名） |
| `auth.getToken` | `() => string \| null \| undefined` | 返回完整 Authorization 头值 |
| `auth.onRefresh` | `(client) => Promise<boolean>` | 401 单例刷新；返回 `true` 自动重放原请求 |
| `auth.onRefreshFailed` | `() => void` | 刷新失败回调 |
| `onLoading` | `(pending: boolean) => void` | 全局 loading 计数器回调 |
| `onError` | `(error: RequestError) => void` | 统一错误出口 |

#### RequestOptions（单次请求）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `loading` | `false` | 是否计入全局 loading |
| `silent` | `false` | 静默模式，不触发全局 `onError` |
| `dedupe` | `true` | 重复请求取消 |
| `skipAuthRetry` | `false` | 401 不触发刷新（登录/刷新接口自身使用） |
| `requestKey` | 自动生成 | 自定义去重 key |
| 其余 | — | 透传 axios 配置（`headers` / `responseType` / `signal` / `onUploadProgress` 等） |

#### RequestClient

`get / delete(url, params?, options?)`、`post / put / patch(url, data?, options?)`、`upload(url, formData, options?)`、`download(url, params?, options?)`、`cancelAll()`、`instance`（原始 axios 实例，逃生舱）。

### `RequestError`

```typescript
type RequestErrorType = 'business' | 'http' | 'network' | 'timeout' | 'cancel';

class RequestError extends Error {
  readonly type: RequestErrorType;
  readonly code: number;      // HTTP 状态码或业务 code
  readonly data?: unknown;    // 后端错误体的 data 字段
  readonly response?: AxiosResponse;
}
```

## License

MIT
