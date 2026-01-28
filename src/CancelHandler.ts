import type { FlatInternalRequestConfig } from './types';

/**
 * 稳定序列化
 * - 按对象 key 排序，确保等价对象得到一致字符串
 * - 用于生成请求唯一 key（method/url/params/data）
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toJSON());
  if (typeof value !== 'object') return JSON.stringify(value as any);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const tag = Object.prototype.toString.call(value);
  if (tag === '[object URLSearchParams]') {
    const entries = Array.from((value as URLSearchParams).entries()).sort((a, b) => {
      if (a[0] === b[0]) return a[1] > b[1] ? 1 : a[1] < b[1] ? -1 : 0;
      return a[0] > b[0] ? 1 : -1;
    });
    return stableStringify(entries);
  }
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const rawEntries = Array.from((value as any).entries() as IterableIterator<[string, string | Blob]>);
    const entries = rawEntries
      .map(([k, v]) => {
        if (v instanceof Blob) {
          const name = (v as File).name || '';
          return [String(k), { name, size: v.size, type: v.type }];
        }
        return [String(k), v];
      })
      .sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0));
    return stableStringify(entries);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}

export class CancelHandler {
  private pendingMap: Map<string, AbortController>;

  constructor() {
    this.pendingMap = new Map();
  }

  /**
   * 生成请求的唯一 Key
   * @param config 请求配置
   */
  public getRequestKey(config: FlatInternalRequestConfig): string {
    if (config.requestKey) return config.requestKey;
    return [config.method, config.url, stableStringify(config.params), stableStringify(config.data)].join('&');
  }

  /**
   * 将请求添加到挂起映射中
   * @param config 请求配置
   */
  public addPending(config: FlatInternalRequestConfig): void {
    this.removePending(config);
    const url = this.getRequestKey(config);
    const controller = new AbortController();
    config.signal = controller.signal;
    this.pendingMap.set(url, controller);
  }

  /**
   * 从挂起映射中移除请求并取消
   * @param config 请求配置
   */
  public removePending(config: FlatInternalRequestConfig): void {
    const url = this.getRequestKey(config);
    if (this.pendingMap.has(url)) {
      const controller = this.pendingMap.get(url);
      controller?.abort();
      this.pendingMap.delete(url);
    }
  }

  /**
   * 从映射中清除请求但不取消（用于请求成功完成后）
   * @param config 请求配置
   */
  public clearPending(config: FlatInternalRequestConfig): void {
    const url = this.getRequestKey(config);
    if (this.pendingMap.has(url)) {
      this.pendingMap.delete(url);
    }
  }

  /**
   * 清除所有挂起的请求
   */
  public removeAllPending(): void {
    this.pendingMap.forEach((controller) => {
      controller.abort();
    });
    this.pendingMap.clear();
  }
}
