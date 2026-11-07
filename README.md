# @vakao/axios

开箱即用、类型安全的 Axios 封装库（v1.0，不兼容 0.x）。内置后端信封解包、401 单例刷新并重放原请求、重复请求取消、全局 loading 计数与统一错误出口。

## 特性

- **开箱即用**：默认适配 `{ code, message, data, timestamp }` 响应信封，成功直接返回 `data`
- **扁平返回**：请求方法直接返回业务数据 `Promise<T>`，失败抛出统一的 `RequestError`
- **401 自愈**：`onRefresh` 单例刷新（并发 401 只刷一次），成功后自动重放原请求
- **重复请求取消**：同 key 的后发请求自动取消先前请求（AbortController）
- **类型安全**：完整的 TypeScript 泛型推断

## 安装

```bash
pnpm add @vakao/axios axios
```

## 快速上手

```typescript
import { createClient, RequestError } from "@vakao/axios";

export const request = createClient({
  baseURL: "/api",
  timeout: 10000,
  headers: { "X-Api-Version": "1" },

  auth: {
    // 返回完整 Authorization 头值；返回空则不注入
    getToken: () => {
      const token = localStorage.getItem("token");
      return token ? `Bearer ${token}` : undefined;
    },
    // 401 时触发（单例，并发请求共享同一次刷新）；返回 true 则自动重放原请求
    onRefresh: async client => {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) return false;
      try {
        const data = await client.post<{ accessToken: string }>(
          "/api/auth/refresh",
          { refreshToken },
          { skipAuthRetry: true, silent: true },
        );
        localStorage.setItem("token", data.accessToken);
        return true;
      } catch {
        return false;
      }
    },
    // 刷新失败回调（清 token、跳登录）
    onRefreshFailed: () => {
      localStorage.removeItem("token");
      location.href = "/login";
    },
  },

  // 全局 loading：内置计数器，首个 loading 请求开始 / 最后一个结束时触发
  onLoading: pending => (pending ? showLoading() : hideLoading()),
  // 统一错误出口；silent: true 与 cancel 不触发。库不提供文案，resolveErrorMessage 由项目自行实现（见下文）
  onError: error => message.error(resolveErrorMessage(error)),
});
```

## 使用

```typescript
interface User {
  id: string;
  name: string;
}

// 直接返回业务数据（已解包 data）
const user = await request.get<User>("/users/1");
const list = await request.get<User[]>("/users", { current: 1, size: 10 });
await request.post("/users", { name: "Alice" });
await request.put(`/users/${user.id}`, { name: "Bob" });
await request.delete(`/users/${user.id}`);

// 上传（自动处理 Content-Type: multipart/form-data）
const form = new FormData();
form.append("file", file);
const { url } = await request.upload<{ url: string }>("/upload", form);

// 下载（返回 Blob）
const blob = await request.download("/export", { id: 1 });

// 取消所有请求
request.cancelAll();
```

调用方错误处理：

```typescript
try {
  const user = await request.get<User>("/users/1");
} catch (error) {
  // 全局 onError 已提示，此处只做兜底或特殊逻辑
  if (error instanceof RequestError && error.type === "cancel") return;
}
```

### 错误处理与文案

库**不内置任何用户可见文案，也不解析错误响应体**。请求失败时抛出的 `RequestError` 携带完整原始信息，
开发者统一在 `onError`（或调用方 `catch`）中按 `type` 与原始响应体自行解释：

```typescript
function resolveErrorMessage(error: RequestError): string {
  // 传输层错误：按类型映射项目文案
  if (error.type === "timeout") return "请求超时，请稍后重试";
  if (error.type === "network") return "网络连接异常，请检查网络";

  // business / http：原始错误信封完整保留在 error.response.data
  const body = error.response?.data as
    | { message?: string | string[] }
    | undefined;
  const text = Array.isArray(body?.message)
    ? body.message.join("；")
    : body?.message;
  return text || "请求失败";
}

createClient({
  onError: error => message.error(resolveErrorMessage(error)),
});
```

> `cancel` 类型不会触发 `onError`；`business` 错误的 `error.message` 为空串，请从 `error.response.data` 取文案。

### 响应契约（成功码与解包）

默认按 `{ code, message, data }` 信封判定：`code === 200` 为成功并返回 `data`。后端约定不同时通过 `contract` 覆盖：

```typescript
createClient({
  contract: {
    // 以 0 / 1 为成功的后端；字符串成功码（如 "00000"）同理，注意类型必须与响应体一致
    successCode: 0,
    // 信封里数据字段不叫 data 时一并覆盖
    unwrap: body => (body as { result: unknown }).result,
  },
});
```

## API 参考

### `createClient(config): RequestClient`

#### ClientConfig

| 字段                                                  | 类型                                | 说明                                                                                                           |
| ----------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `baseURL` / `timeout` / `headers` / `withCredentials` | axios 原生                          | 透传 axios，`timeout` 默认 10000                                                                               |
| `contract.successCode`                                | `number \| string`                  | 业务成功码，默认 `200`；后端约定不同可设为 `0` / `1` / `"00000"` 等，严格相等判定，类型须与响应体 `code` 一致  |
| `contract.unwrap`                                     | `(body) => unknown`                 | 从信封取业务数据，默认 `body => body.data`                                                                     |
| `auth.getToken`                                       | `() => string \| null \| undefined` | 返回完整 Authorization 头值                                                                                    |
| `auth.onRefresh`                                      | `(client) => Promise<boolean>`      | 401 单例刷新；返回 `true` 自动重放原请求                                                                       |
| `auth.onRefreshFailed`                                | `() => void`                        | 刷新失败回调                                                                                                   |
| `onLoading`                                           | `(pending: boolean) => void`        | 全局 loading 计数器回调                                                                                        |
| `onError`                                             | `(error: RequestError) => void`     | 统一错误出口（`silent` / `cancel` 不触发）；库不提供文案，原始响应体取 `error.response.data`，由使用方自行解析 |

#### RequestOptions（单次请求）

| 字段            | 默认     | 说明                                                                             |
| --------------- | -------- | -------------------------------------------------------------------------------- |
| `loading`       | `false`  | 是否计入全局 loading                                                             |
| `silent`        | `false`  | 静默模式，不触发全局 `onError`                                                   |
| `dedupe`        | `true`   | 重复请求取消                                                                     |
| `skipAuthRetry` | `false`  | 401 不触发刷新（登录/刷新接口自身使用）                                          |
| `requestKey`    | 自动生成 | 自定义去重 key                                                                   |
| 其余            | —        | 透传 axios 配置（`headers` / `responseType` / `signal` / `onUploadProgress` 等） |

#### RequestClient

`get / delete(url, params?, options?)`、`post / put / patch(url, data?, options?)`、`upload(url, formData, options?)`、`download(url, params?, options?)`、`cancelAll()`、`instance`（原始 axios 实例，逃生舱）。

### `RequestError`

```typescript
type RequestErrorType = "business" | "http" | "network" | "timeout" | "cancel";

class RequestError extends Error {
  readonly type: RequestErrorType;
  readonly code: number; // HTTP 状态码或业务 code
  readonly data?: unknown; // 后端错误体的 data 字段
  readonly response?: AxiosResponse; // 原始响应；错误信封取 response.data
  // message 为 axios 原始信息（business 错误为空串），不要直接当作用户文案
}
```

## License

MIT
