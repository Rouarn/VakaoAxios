# @vakao-ui/axios

一个功能完善、开箱即用、类型安全的 Axios 封装库，灵感来源于 `alova` 和 `soybean-admin` 的请求设计。

## 特性

- ✨ **开箱即用**: 内置智能拦截器，无需繁琐配置。
- 🛡️ **类型安全**: 基于 TypeScript 构建，提供完整的类型推断，拒绝 `any`。
- 🚀 **扁平化 API**: `createFlatRequest` 提供简洁的创建方式和调用体验。
- 🔄 **自动重试与取消**: 内置请求重试机制和重复请求自动取消功能。
- 🎨 **高度可定制**: 支持自定义业务成功判断、错误处理、数据转换等钩子。

## 安装

```bash
pnpm add @vakao-ui/axios axios
# 或
npm install @vakao-ui/axios axios
```

## 快速上手

### 1. 创建请求实例

建议在项目中创建一个 `request.ts` 文件：

```typescript
import { createFlatRequest } from '@vakao-ui/axios';
import type { AxiosResponse } from 'axios';

// 定义后端统一响应结构
interface BackendResult<T = any> {
  code: number | string;
  data: T;
  message: string;
}

export const request = createFlatRequest<BackendResult>(
  // 1. Axios 基础配置
  {
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10 * 1000,
    // 开启重复请求取消
    cancelDuplicateRequest: true, 
  },
  // 2. 业务逻辑钩子
  {
    // 判断请求是否成功
    isBackendSuccess: (response) => {
      return response.data.code === 200;
    },
    // 成功时转换数据（直接返回 data 字段）
    transform: (response) => {
      return response.data.data;
    },
    // 业务失败处理（如 token 过期、权限不足）
    onBackendFail: async (response, instance) => {
      const { code, message } = response.data;
      // 处理 token 过期
      if (code === 401) {
        // 执行登出或刷新 token 逻辑
      }
      console.error(message);
    },
    // 全局错误处理（网络错误等）
    onError: (error) => {
      console.error('请求失败:', error);
    },
    // 请求拦截器
    onRequest: async (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    }
  }
);
```

### 2. 使用请求

```typescript
interface User {
  id: number;
  name: string;
}

// GET 请求
const user = await request.get<User>('/users/1');
console.log(user.name);

// POST 请求
await request.post('/users', { name: 'Alice' });
```

## API 参考

### `createFlatRequest(config, options)`

#### 参数

- `config`: `AxiosRequestConfig` & `FlatRequestInstanceConfig`
  - `requestKey?: string`: 自定义请求唯一标识
  - `cancelDuplicateRequest?: boolean`: 是否开启重复请求取消 (默认 true)
  - 其他 Axios 标准配置

- `options`: `RequestOptions`
  - `isBackendSuccess(response)`: (必须) 判断业务逻辑是否成功
  - `onBackendFail(response, instance)`: (必须) 业务逻辑失败回调
  - `transform(response)`: (必须) 数据转换函数
  - `onError(error)`: (必须) 全局错误处理
  - `onRequest(config)`: (可选) 请求拦截器

## License

MIT
