export type InstanceStatus = 'running' | 'stopped' | 'terminated' | 'pending' | 'error';

export interface InstanceSpec {
  cpu: number;
  memoryMb: number;
  diskGb: number;
}

export interface Instance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string;
  region: string;
  status: InstanceStatus;
  spec: InstanceSpec;
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: number;
  tags: Record<string, string>;
  lastSyncedAt: Date;
  createdAt: Date;
}

export interface CreateInstanceOpts {
  provider: string;
  region: string;
  name: string;
  imageId: string;
  instanceType: string;
  subnetId?: string;
  securityGroupIds?: string[];
  tags?: Record<string, string>;
}

export interface Region {
  id: string;
  name: string;
  displayName: string;
}

export interface Image {
  id: string;
  name: string;
  description?: string;
}

export interface InstanceType {
  id: string;
  name: string;
  cpu: number;
  memoryMb: number;
  diskGb?: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface MetricData {
  timestamp: Date;
  value: number;
  unit: string;
}

export interface CostSummary {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  service: string;
  amount: number;
}

export interface ListOptions {
  region?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ICloudProvider {
  readonly name: string;
  readonly displayName: string;

  listInstances(region?: string, options?: ListOptions): Promise<Instance[]>;
  getInstance(id: string): Promise<Instance>;
  createInstance(opts: CreateInstanceOpts): Promise<Instance>;
  deleteInstance(id: string): Promise<void>;
  startInstance(id: string): Promise<void>;
  stopInstance(id: string): Promise<void>;
  rebootInstance(id: string): Promise<void>;

  listRegions(): Promise<Region[]>;
  listImages(): Promise<Image[]>;
  listInstanceTypes(region: string): Promise<InstanceType[]>;

  getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]>;
  getCostSummary(timeRange: TimeRange): Promise<CostSummary>;

  // ===== 新增：通用资源管理 =====
  /** 列出指定类型的所有资源 */
  listResources(resourceType: ResourceType, region?: string): Promise<CloudResource[]>;
  /** 获取指定类型的单个资源详情 */
  getResource(resourceType: ResourceType, id: string): Promise<CloudResource>;
  /** 删除指定类型的资源 */
  deleteResource(resourceType: ResourceType, id: string): Promise<void>;
  /** 获取该 Provider 支持的资源类型列表 */
  getSupportedResourceTypes(): ResourceType[];
}

// ===== 资源类型枚举 =====
export const RESOURCE_TYPES = [
  'instance',        // 计算/虚拟机
  'disk',            // 磁盘/卷
  'bucket',          // 对象存储
  'database',        // 数据库
  'cache',           // 缓存
  'loadbalancer',    // 负载均衡
  'vpc',             // 虚拟网络
  'securitygroup',   // 安全组
  'cdn',             // CDN
  'cluster',         // 容器集群
  'aiservice',       // AI 服务（如 Azure CognitiveServices、AWS Bedrock 等）
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

// ===== 通用资源接口 =====
export interface CloudResource {
  id: string;
  provider: string;
  resourceType: ResourceType;
  providerResourceId: string;
  name: string;
  region: string;
  status: string;
  createdAt: Date;
  tags: Record<string, string>;
  attributes: Record<string, unknown>;
  cloudAccountId?: string;
}

// ===== 磁盘/卷 =====
export interface Disk extends CloudResource {
  resourceType: 'disk';
  attributes: {
    sizeGb: number;
    diskType: string;
    iops?: number;
    throughput?: number;
    encrypted: boolean;
    attachedInstanceId?: string;
    attachmentStatus?: string;
  };
}

// ===== 对象存储桶 =====
export interface Bucket extends CloudResource {
  resourceType: 'bucket';
  attributes: {
    storageClass: string;
    objectCount: number;
    sizeBytes: number;
    versioning: boolean;
    publicAccess: boolean;
    lifecycleRules?: number;
  };
}

// ===== 数据库实例 =====
export interface DatabaseInstance extends CloudResource {
  resourceType: 'database';
  attributes: {
    engine: string;
    engineVersion: string;
    instanceClass: string;
    storageGb: number;
    multiAz: boolean;
    endpoint?: string;
    port?: number;
  };
}

// ===== 缓存实例 =====
export interface CacheInstance extends CloudResource {
  resourceType: 'cache';
  attributes: {
    engine: string;
    engineVersion: string;
    instanceClass: string;
    memoryMb: number;
    nodeType?: string;
    shardCount?: number;
    endpoint?: string;
    port?: number;
  };
}

// ===== 负载均衡器 =====
export interface LoadBalancer extends CloudResource {
  resourceType: 'loadbalancer';
  attributes: {
    type: string;
    scheme: string;
    dnsName?: string;
    vpcId?: string;
    listenerCount: number;
    targetCount: number;
  };
}

// ===== VPC 虚拟网络 =====
export interface Vpc extends CloudResource {
  resourceType: 'vpc';
  attributes: {
    cidrBlock: string;
    subnetCount: number;
    isDefault: boolean;
    state: string;
  };
}

// ===== 安全组 =====
export interface SecurityGroup extends CloudResource {
  resourceType: 'securitygroup';
  attributes: {
    vpcId?: string;
    ruleCount: number;
    ingressRules: number;
    egressRules: number;
    description?: string;
  };
}

// ===== CDN 分发 =====
export interface CdnDistribution extends CloudResource {
  resourceType: 'cdn';
  attributes: {
    domainName: string;
    originDomain?: string;
    originType: string;
    enabled: boolean;
    priceClass?: string;
    sslCertificate?: string;
  };
}

// ===== 容器集群 =====
export interface Cluster extends CloudResource {
  resourceType: 'cluster';
  attributes: {
    clusterType: string;
    kubernetesVersion: string;
    nodeCount: number;
    status: string;
    endpoint?: string;
    vpcId?: string;
  };
}

// ===== AI 服务 =====
export interface AiService extends CloudResource {
  resourceType: 'aiservice';
  attributes: {
    serviceKind: string;       // 服务种类，如 cognitiveServices, openAI, speech, vision 等
    skuName?: string;          // SKU 名称
    endpoint?: string;         // 服务端点 URL
    kind?: string;             // Azure CognitiveServices kind（如 OpenAI, SpeechServices 等）
    provisioningState?: string;
  };
}

// ===== 资源类型联合类型 =====
export type TypedResource = Disk | Bucket | DatabaseInstance | CacheInstance |
  LoadBalancer | Vpc | SecurityGroup | CdnDistribution | Cluster | AiService;

// ===== 资源元数据 =====
export interface ResourceTypeMeta {
  type: ResourceType;
  displayName: string;
  iconName: string;
  category: 'compute' | 'storage' | 'database' | 'network' | 'security' | 'cdn' | 'container' | 'ai';
  supportedProviders: string[];
}

export const RESOURCE_TYPE_META: ResourceTypeMeta[] = [
  { type: 'instance', displayName: '云服务器', iconName: 'server', category: 'compute', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
  { type: 'disk', displayName: '云磁盘', iconName: 'hard-drive', category: 'storage', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
  { type: 'bucket', displayName: '对象存储', iconName: 'database', category: 'storage', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'database', displayName: '数据库', iconName: 'database', category: 'database', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
  { type: 'cache', displayName: '缓存', iconName: 'zap', category: 'database', supportedProviders: ['aws','aliyun','azure','tencent','huawei','render'] },
  { type: 'loadbalancer', displayName: '负载均衡', iconName: 'share-2', category: 'network', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'vpc', displayName: '虚拟网络', iconName: 'git-branch', category: 'network', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'securitygroup', displayName: '安全组', iconName: 'shield', category: 'security', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'cdn', displayName: 'CDN', iconName: 'globe', category: 'cdn', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'cluster', displayName: '容器集群', iconName: 'boxes', category: 'container', supportedProviders: ['aws','aliyun','azure','tencent','huawei'] },
  { type: 'aiservice', displayName: 'AI 服务', iconName: 'cpu', category: 'ai', supportedProviders: ['azure','aws'] },
];