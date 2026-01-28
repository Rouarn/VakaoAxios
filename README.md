# Vakao Axios

一个强大且灵活的 Axios 封装库，适用于浏览器和 Node.js 环境，提供自动重试、请求取消和 TypeScript 支持等增强功能。

## 特性

- ✨ **深度封装**: 统一的请求/响应拦截器机制。
- 🔄 **自动重试**: 内置请求重试功能，可配置重试次数和延迟。
- 🚫 **请求取消**: 自动取消重复请求（可配置）。
- 🔌 **TypeScript**: 完整的 TypeScript 支持和类型定义。
- 📦 **多格式支持**: 支持 CJS, ESM, 和 UMD 构建格式。
- 🌍 **跨平台**: 在浏览器和 Node.js 环境中均可运行。

## 安装

```bash
npm install vakao-axios axios
# 或
pnpm add vakao-axios axios
# 或
yarn add vakao-axios axios
```

## 快速开始

```typescript
import { createVakaoAxios } from 'vakao-axios';

// 创建实例
const request = createVakaoAxios({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  // 全局重试配置
  retry: 0,
});

// 发起请求
interface User {
  id: number;
  name: string;
}

request.get<User>({ url: '/users/1' })
  .then(res => {
    console.log(res.data.name);
  })
  .catch(err => {
    console.error(err);
  });
```

## 高级用法

### 请求重试

为特定请求开启重试：

```typescript
request.get({
  url: '/unstable-api',
  retry: 3,        // 重试 3 次
  retryDelay: 1000 // 每次重试间隔 1 秒
});
```

### 拦截器

添加自定义拦截器：

```typescript
const request = createVakaoAxios({
  baseURL: 'https://api.example.com',
  interceptors: {
    requestInterceptor: (config) => {
      // 添加 token
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    responseInterceptor: (res) => {
      // 处理响应
      return res;
    },
    responseInterceptorCatch: (err) => {
      // 全局错误处理
      return Promise.reject(err);
    }
  },
});
```

### 请求取消

默认情况下，`vakao-axios` 会自动取消尚未完成的重复请求（具有相同方法、URL、参数和数据的请求）。

如果需要针对特定请求禁用此行为：

```typescript
request.get({
  url: '/users',
  cancelDuplicateRequest: false,
});
```

手动取消所有挂起的请求：

```typescript
request.cancelAll();
```

## API 参考

### `createVakaoAxios(config: VakaoInstanceConfig)`

创建一个新的 VakaoAxios 实例。

### `VakaoInstanceConfig`

扩展自 `AxiosRequestConfig`，新增以下属性：

- `retry`: number (默认值: 0) - 重试次数
- `retryDelay`: number (默认值: 1000) - 重试延迟（毫秒）
- `cancelDuplicateRequest`: boolean (默认值: true) - 是否取消重复请求
- `interceptors`: VakaoInterceptors - 自定义拦截器

## License

MIT
