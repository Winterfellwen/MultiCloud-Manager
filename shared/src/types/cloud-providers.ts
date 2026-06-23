// 云厂商元数据声明（前后端共享的字段配置）
// 参考 MultiCloud-Manager 的 cloudConfigs 设计，用声明式数据驱动动态表单
// 优化点：新增腾讯云/华为云支持、字段类型丰富（text/password/textarea）、默认值、必填标识

export type CloudProviderId = 'aws' | 'aliyun' | 'azure' | 'tencent' | 'huawei' | 'render' | 'oracle';

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

/** 获取凭证的步骤指引 */
export interface ProviderGuide {
  title: string;
  steps: string[];
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
  {
    id: 'render',
    label: 'Render',
    description: 'Render Cloud Hosting',
    color: '#1D6BF0',
    docsUrl: 'https://render.com/docs/api',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'rnd_cI...', help: '在 Render Dashboard → Account Settings → API Keys 创建' },
    ],
  },
  {
    id: 'oracle',
    label: 'Oracle Cloud',
    description: 'Oracle Cloud Infrastructure',
    color: '#F80000',
    docsUrl: 'https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm',
    fields: [
      { key: 'userOcid', label: 'User OCID', type: 'text', required: true, placeholder: 'ocid1.user.oc1...' },
      { key: 'tenancyOcid', label: 'Tenancy OCID', type: 'text', required: true, placeholder: 'ocid1.tenancy.oc1...' },
      { key: 'compartmentOcid', label: 'Compartment OCID', type: 'text', required: true, placeholder: 'ocid1.compartment.oc1...' },
      { key: 'fingerprint', label: 'API Key Fingerprint', type: 'text', required: true, placeholder: 'e2:90:2d:...' },
      { key: 'region', label: 'Region', type: 'text', required: true, default: 'us-ashburn-1', placeholder: 'us-ashburn-1' },
      { key: 'privateKey', label: 'Private Key (PEM)', type: 'textarea', required: true, placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----', help: '下载的 API 私钥内容，支持 PKCS#8 和 PKCS#1 格式' },
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

/**
 * 各云厂商获取凭证的步骤指引
 * 参考 MultiCloud-Manager 的 getCloudGuide 设计
 */
export const CLOUD_GUIDES: Record<CloudProviderId, ProviderGuide> = {
  aws: {
    title: '如何获取 AWS 凭证',
    steps: [
      '登录 <a href="https://console.aws.amazon.com" target="_blank">AWS Console</a> → IAM → 用户',
      '选择用户 → 安全凭证 → 创建访问密钥',
      '选择用例（CLI）→ 创建 → 复制 Access Key ID 和 Secret Access Key',
      '输入资源所在的区域，如 us-east-1、ap-northeast-1',
    ],
  },
  aliyun: {
    title: '如何获取阿里云凭证',
    steps: [
      '登录 <a href="https://www.aliyun.com" target="_blank">阿里云控制台</a> → 右上角头像 → AccessKey 管理',
      '点击"创建 AccessKey" → 身份验证 → 保存 AccessKey ID 和 Secret',
      '⚠️ AccessKey Secret 只显示一次，请立即保存',
      '建议：使用 RAM 用户 AccessKey，而不是主账号',
    ],
  },
  azure: {
    title: '如何获取 Azure 凭证',
    steps: [
      '登录 <a href="https://portal.azure.com" target="_blank">Azure Portal</a> → Azure AD → 应用注册',
      '创建应用注册，复制应用程序（客户端）ID 和目录（租户）ID',
      '在"证书和密码"下创建客户端密码',
      '在订阅中为应用分配"参与者"角色',
    ],
  },
  tencent: {
    title: '如何获取腾讯云凭证',
    steps: [
      '登录 <a href="https://console.cloud.tencent.com" target="_blank">腾讯云控制台</a> → 访问管理 → API 密钥',
      '点击"创建 SecretKey" → 复制 SecretId 和 SecretKey',
      '建议：使用子账号密钥进行访问控制',
    ],
  },
  huawei: {
    title: '如何获取华为云凭证',
    steps: [
      '登录 <a href="https://console.huaweicloud.com" target="_blank">华为云控制台</a> → 我的凭证 → 访问密钥',
      '点击"新增访问密钥" → 下载密钥文件，复制 Access Key ID 和 Secret Access Key',
      '如需跨项目访问，还需填写 Project ID（在"我的凭证"页面获取）',
    ],
  },
  render: {
    title: '如何获取 Render API Key',
    steps: [
      '登录 <a href="https://dashboard.render.com" target="_blank">Render Dashboard</a>',
      '点击右上角头像 → Account Settings → API Keys',
      '点击"Create API Key"，设置名称和过期时间',
      '复制生成的 API Key（以 rnd_ 开头）',
    ],
  },
  oracle: {
    title: '如何获取 Oracle Cloud 凭证',
    steps: [
      '登录 <a href="https://cloud.oracle.com" target="_blank">Oracle Cloud Console</a> → Identity → Users',
      '选择用户 → API Keys → Add API Key',
      '下载生成的私钥文件，将内容粘贴到 Private Key 字段',
      '复制 Tenancy OCID、User OCID 和 Fingerprint',
      '如果实例不在根分区，前往 Identity → Compartments 复制目标 Compartment OCID',
    ],
  },
};

/** 获取云厂商凭证指引 */
export function getProviderGuide(id: CloudProviderId): ProviderGuide | undefined {
  return CLOUD_GUIDES[id];
}
