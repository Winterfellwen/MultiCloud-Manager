export type InstanceStatus = 'running' | 'stopped' | 'terminated' | 'pending' | 'error';
export type CloudProvider = 'aws' | 'aliyun' | 'azure' | 'tencent' | 'huawei';

export interface InstanceRow {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string | null;
  region: string;
  status: InstanceStatus;
  cpu: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: string | null;
  tags: Record<string, string> | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
  cloudAccountId: string | null;
}

export interface CreateInstanceParams {
  provider: string;
  region: string;
  name: string;
  imageId: string;
  instanceType: string;
  subnetId?: string;
  securityGroupIds?: string[];
  tags?: Record<string, string>;
}

export interface Instance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string;
  region: string;
  status: InstanceStatus;
  spec: { cpu: number; memoryMb: number; diskGb: number };
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: number;
  tags: Record<string, string>;
  lastSyncedAt: string;
  createdAt: string;
}

export interface InstanceActionResponse {
  ok: true;
  id: string;
  status: InstanceStatus;
}

export interface ListInstancesParams {
  provider?: string;
  region?: string;
  status?: InstanceStatus;
  limit?: number;
  offset?: number;
}

export interface ProviderRegion {
  id: string;
  name: string;
  displayName: string;
}

export interface ProviderImage {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderInstanceType {
  id: string;
  name: string;
  cpu: number;
  memoryMb: number;
  diskGb?: number;
}

export interface CloudAccount {
  id: string;
  name: string;
  provider: CloudProvider;
  config: Record<string, unknown>;
  /** 凭证脱敏提示（如 AKIA****wX9z），永不返回明文 */
  credentialHint?: Record<string, string>;
  status: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  provider: string;
  synced: number;
  errors: string[];
}

/** 测试连接结果 */
export interface TestConnectionResult {
  ok: boolean;
  message: string;
  details?: unknown;
}

/** 云厂商凭证字段定义（从后端 /cloud/providers/meta 获取） */
export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea';
  required: boolean;
  placeholder?: string;
  default?: string;
  help?: string;
}

/** 云厂商元数据 */
export interface ProviderMeta {
  id: CloudProvider;
  label: string;
  description: string;
  color: string;
  fields: CredentialField[];
  docsUrl?: string;
}
