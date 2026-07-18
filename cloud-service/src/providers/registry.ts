import { ICloudProvider } from './types.js';
import type { RenderConfig } from './render/types.js';
import type { OracleConfig } from './oracle/types.js';
import type { GcpConfig } from './gcp/index.js';

const providers = new Map<string, ICloudProvider>();

export interface ProviderConfig {
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    roleArn?: string;
  };
  aliyun?: {
    accessKeyId: string;
    accessKeySecret: string;
    region: string;
  };
  azure?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    subscriptionId: string;
  };
  tencent?: {
    secretId: string;
    secretKey: string;
    region: string;
  };
  huawei?: {
    accessKeyId: string;
    accessKeySecret: string;
    region: string;
    projectId?: string;
  };
  render?: RenderConfig;
  oracle?: OracleConfig;
  gcp?: GcpConfig;
}

const providerFactories: Record<string, (config: any) => Promise<ICloudProvider>> = {
  aws: async (cfg) => {
    const { AWSProvider } = await import('./aws/index.js');
    return new AWSProvider(cfg);
  },
  aliyun: async (cfg) => {
    const { AliyunProvider } = await import('./aliyun/index.js');
    return new AliyunProvider(cfg);
  },
  azure: async (cfg) => {
    const { AzureProvider } = await import('./azure/index.js');
    return new AzureProvider(cfg);
  },
  tencent: async (cfg) => {
    const { TencentProvider } = await import('./tencent/index.js');
    return new TencentProvider(cfg);
  },
  huawei: async (cfg) => {
    const { HuaweiProvider } = await import('./huawei/index.js');
    return new HuaweiProvider(cfg);
  },
  render: async (cfg) => {
    const { RenderProvider } = await import('./render/index.js');
    // 兼容两种 config 形态：字符串 apiKey 或 { apiKey } 对象
    const apiKey = typeof cfg === 'string' ? cfg : cfg.apiKey;
    return new RenderProvider(apiKey);
  },
  oracle: async (cfg) => {
    const { OracleProvider } = await import('./oracle/index.js');
    return new OracleProvider(cfg);
  },
  gcp: async (cfg) => {
    const { GcpProvider } = await import('./gcp/index.js');
    return new GcpProvider(cfg);
  },
};

export async function registerProviders(config: ProviderConfig): Promise<void> {
  const entries = Object.entries(config).filter(([key, val]) => val && providerFactories[key]);
  // 串行加载避免多个 SDK 同时加载导致内存尖峰；已注册的 provider 如果 config 变化则重新注册
  for (const [key, cfg] of entries) {
    if (providers.has(key)) {
      // 重新注册以更新凭证（ provider 内部持有旧凭证引用）
      providers.delete(key);
    }
    const provider = await providerFactories[key](cfg);
    providers.set(key, provider);
  }
}

export function getProvider(name: string): ICloudProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}

export function hasProvider(name: string): boolean {
  return providers.has(name);
}
