// 云厂商元数据声明（前后端共享的字段配置）
// 参考 MultiCloud-Manager 的 cloudConfigs 设计，用声明式数据驱动动态表单
// 优化点：新增腾讯云/华为云支持、字段类型丰富（text/password/textarea）、默认值、必填标识

export type CloudProviderId = 'aws' | 'aliyun' | 'azure' | 'tencent' | 'huawei';

export type CredentialFieldType = 'text' | 'password' | 'textarea';

export interface CredentialField {
  /** 字段 key（存入 config 对象的键名） */
  key: string;
  /** 显示标签 */
  label: string;
  /** 输入类型 */
  type: CredentialFieldType;
  /** 是否必填 */
  required: boolean;
  /** 占位提示 */
  placeholder?: string;
  /** 默认值 */
  default?: string;
  /** 帮助文案 */
  help?: string;
}

export interface ProviderMeta {
  /** 厂商 ID */
  id: CloudProviderId;
  /** 显示名称 */
  label: string;
  /** 简短描述 */
  description: string;
  /** 主题色（用于 UI 图标背景） */
  color: string;
  /** 凭证字段定义 */
  fields: CredentialField[];
  /** 获取凭证的操作指引链接 */
  docsUrl?: string;
}

/**
 * 支持的云厂商清单
 * 新增厂商只需在此声明字段，前端表单自动适配
 */
export const CLOUD_PROVIDERS: ProviderMeta[] = [
  {
    id: 'aws',
    label: 'AWS',
    description: 'Amazon Web Services',
    color: '#FF9900',
    docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true, placeholder: 'AKIA...' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true, placeholder: 'wJalrXUtnFEMI...' },
      { key: 'region', label: '默认区域', type: 'text', required: true, default: 'us-east-1', placeholder: 'us-east-1' },
    ],
  },
  {
    id: 'aliyun',
    label: '阿里云',
    description: 'Alibaba Cloud',
    color: '#1677FF',
    docsUrl: 'https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true, placeholder: 'LTAI...' },
      { key: 'accessKeySecret', label: 'Access Key Secret', type: 'password', required: true, placeholder: '...' },
      { key: 'region', label: '默认区域', type: 'text', required: true, default: 'cn-hangzhou', placeholder: 'cn-hangzhou' },
    ],
  },
  {
    id: 'azure',
    label: 'Azure',
    description: 'Microsoft Azure',
    color: '#0078D4',
    docsUrl: 'https://learn.microsoft.com/zh-cn/azure/azure-portal/get-subscription-tenant-id',
    fields: [
      { key: 'tenantId', label: 'Tenant ID', type: 'text', required: true, placeholder: '00000000-0000-...' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '00000000-0000-...' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: '...' },
      { key: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true, placeholder: '00000000-0000-...' },
    ],
  },
  {
    id: 'tencent',
    label: '腾讯云',
    description: 'Tencent Cloud',
    color: '#006EFF',
    docsUrl: 'https://cloud.tencent.com/document/product/598/40488',
    fields: [
      { key: 'secretId', label: 'Secret ID', type: 'text', required: true, placeholder: 'AKID...' },
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, placeholder: '...' },
      { key: 'region', label: '默认区域', type: 'text', required: true, default: 'ap-guangzhou', placeholder: 'ap-guangzhou' },
    ],
  },
  {
    id: 'huawei',
    label: '华为云',
    description: 'Huawei Cloud',
    color: '#FF0000',
    docsUrl: 'https://support.huaweicloud.com/usermanual-iam/iam_02_0003.html',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true, placeholder: 'AK...' },
      { key: 'accessKeySecret', label: 'Secret Access Key', type: 'password', required: true, placeholder: '...' },
      { key: 'region', label: '默认区域', type: 'text', required: true, default: 'cn-north-4', placeholder: 'cn-north-4' },
      { key: 'projectId', label: 'Project ID', type: 'text', required: false, placeholder: '可选，跨项目访问时填写', help: '在"我的凭证"页面获取项目 ID' },
    ],
  },
];

/** 厂商 ID 到元数据的映射 */
export const PROVIDER_META_MAP: Record<string, ProviderMeta> = Object.fromEntries(
  CLOUD_PROVIDERS.map(p => [p.id, p])
);

/** 获取所有支持的厂商 ID */
export function getSupportedProviderIds(): CloudProviderId[] {
  return CLOUD_PROVIDERS.map(p => p.id);
}

/** 根据厂商 ID 获取元数据 */
export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_META_MAP[id];
}

/**
 * 对凭证进行脱敏（参考 MultiCloud-Manager 的 maskCredential）
 * 永不返回明文，只返回脱敏提示
 */
export function maskCredential(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

/**
 * 对整个 config 对象脱敏，返回 credentialHint
 */
export function maskConfig(providerId: string, config: Record<string, unknown>): Record<string, string> {
  const meta = getProviderMeta(providerId);
  if (!meta) return {};

  const result: Record<string, string> = {};
  for (const field of meta.fields) {
    const value = config[field.key];
    if (typeof value === 'string' && value) {
      result[field.key] = maskCredential(value);
    }
  }
  return result;
}
