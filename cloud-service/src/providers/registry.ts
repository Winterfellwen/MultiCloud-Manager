import { ICloudProvider } from './types.js';
import { AWSProvider } from './aws/index.js';
import { AliyunProvider } from './aliyun/index.js';
import { AzureProvider } from './azure/index.js';

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
}

export function registerProviders(config: ProviderConfig): void {
  if (config.aws) {
    providers.set('aws', new AWSProvider(config.aws));
  }
  if (config.aliyun) {
    providers.set('aliyun', new AliyunProvider(config.aliyun));
  }
  if (config.azure) {
    providers.set('azure', new AzureProvider(config.azure));
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