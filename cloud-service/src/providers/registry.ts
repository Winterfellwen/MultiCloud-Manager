import { ICloudProvider } from './types.js';
import type { RenderConfig } from './render/types.js';

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
    return new RenderProvider(cfg);
  },
};

export async function registerProviders(config: ProviderConfig): Promise<void> {
  const entries = Object.entries(config).filter(([key, val]) => val && providerFactories[key]);
  await Promise.all(
    entries.map(async ([key, cfg]) => {
      const provider = await providerFactories[key](cfg);
      providers.set(key, provider);
    })
  );
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
