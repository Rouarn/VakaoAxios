import type { VakaoInternalRequestConfig } from './types';

export class CancelHandler {
  private pendingMap: Map<string, AbortController>;

  constructor() {
    this.pendingMap = new Map();
  }

  /**
   * 生成请求的唯一 Key
   * @param config 请求配置
   */
  public getRequestKey(config: VakaoInternalRequestConfig): string {
    if (config.requestKey) return config.requestKey;
    return [config.method, config.url, JSON.stringify(config.params), JSON.stringify(config.data)].join('&');
  }

  /**
   * 将请求添加到挂起映射中
   * @param config 请求配置
   */
  public addPending(config: VakaoInternalRequestConfig): void {
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
  public removePending(config: VakaoInternalRequestConfig): void {
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
  public clearPending(config: VakaoInternalRequestConfig): void {
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
