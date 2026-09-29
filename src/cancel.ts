import type { AxiosRequestConfig } from 'axios';

interface FormDataWithEntries extends FormData {
  entries(): IterableIterator<[string, string | Blob]>;
}

/**
 * 稳定序列化
 * - 按对象 key 排序，确保等价对象得到一致字符串
 * - 用于生成请求唯一 key（method/url/params/data）
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toJSON());
  if (typeof value !== 'object') return JSON.stringify(value);
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
    // 检查 entries 是否存在 (部分环境可能不完全支持)
    if (typeof (value as unknown as { entries: unknown }).entries !== 'function') {
      return 'FormData';
    }
    const rawEntries = Array.from((value as FormDataWithEntries).entries());
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

type PendingConfig = AxiosRequestConfig & { requestKey?: string };

/**
 * 重复请求取消处理器
 * 基于 AbortController 维护 pending 请求，同 key 后发请求取消先前请求
 */
export class CancelHandler {
  private pendingMap: Map<string, AbortController> = new Map();

  /**
   * 生成请求的唯一 Key
   */
  getRequestKey(config: PendingConfig): string {
    if (config.requestKey) return config.requestKey;
    return [config.method, config.url, stableStringify(config.params), stableStringify(config.data)].join('&');
  }

  /**
   * 将请求加入挂起映射（同 key 旧请求会被取消）
   */
  addPending(config: PendingConfig): void {
    this.removePending(config);
    const key = this.getRequestKey(config);
    const controller = new AbortController();
    config.signal = controller.signal;
    this.pendingMap.set(key, controller);
  }

  /**
   * 取消并移除挂起请求
   */
  removePending(config: PendingConfig): void {
    const key = this.getRequestKey(config);
    const controller = this.pendingMap.get(key);
    if (controller) {
      controller.abort();
      this.pendingMap.delete(key);
    }
  }

  /**
   * 仅移除不取消（请求正常完成后调用）
   */
  clearPending(config: PendingConfig): void {
    const key = this.getRequestKey(config);
    this.pendingMap.delete(key);
  }

  /**
   * 取消所有挂起请求
   */
  removeAllPending(): void {
    this.pendingMap.forEach((controller) => controller.abort());
    this.pendingMap.clear();
  }
}
