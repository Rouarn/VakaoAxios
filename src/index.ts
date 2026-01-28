import { VakaoAxios } from './VakaoAxios';
import { VakaoInstanceConfig } from './types';

export function createVakaoAxios(config: VakaoInstanceConfig): VakaoAxios {
  return new VakaoAxios(config);
}

export * from './types';
export * from './VakaoAxios';
