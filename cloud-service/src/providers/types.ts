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
}