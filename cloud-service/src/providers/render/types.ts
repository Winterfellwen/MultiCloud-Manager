// cloud-service/src/providers/render/types.ts

export interface RenderConfig {
  apiKey: string;
}

// ===== Service Types =====
export type RenderServiceType = 'web_service' | 'static_site' | 'background_worker' | 'cron_job' | 'private_service';
export type RenderServiceStatus = 'live' | 'suspended' | 'deploying' | 'deprovisioning' | 'deleted' | 'cooldown';
export type RenderPlan = 'free' | 'starter' | 'standard' | 'pro' | 'pro_plus' | 'custom';

export interface RenderService {
  id: string;
  name: string;
  type: RenderServiceType;
  region: string;
  status: RenderServiceStatus;
  createdAt: string;
  updatedAt: string;
  serviceDetails?: RenderServiceDetails;
}

export interface RenderServiceDetails {
  url?: string;
  branch?: string;
  plan?: RenderPlan;
  autoDeploy?: string;
  env?: string;
}

// ===== Database Types =====
export type RenderDatabaseType = 'postgresql' | 'redis';

export interface RenderDatabase {
  id: string;
  name: string;
  databaseType: RenderDatabaseType;
  region: string;
  status: RenderServiceStatus;
  createdAt: string;
  databaseDetails?: RenderDatabaseDetails;
}

export interface RenderDatabaseDetails {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  plan?: RenderPlan;
}

// ===== API Response Types =====
export interface RenderListResponse<T> {
  data: T[];
}

export interface RenderError {
  message: string;
  code?: string;
}

// ===== Metrics Types =====
export interface RenderMetricResponse {
  data: RenderMetricDataPoint[];
}

export interface RenderMetricDataPoint {
  values: number[];
  timestamps: string[];
}

// ===== Plan Pricing =====
export const RENDER_PLAN_SPECS: Record<RenderPlan, { cpu: number; memoryMb: number; monthlyCost: number; displayName: string }> = {
  free: { cpu: 0.1, memoryMb: 256, monthlyCost: 0, displayName: '免费' },
  starter: { cpu: 1, memoryMb: 2048, monthlyCost: 7, displayName: '入门' },
  standard: { cpu: 2, memoryMb: 4096, monthlyCost: 25, displayName: '标准' },
  pro: { cpu: 4, memoryMb: 8192, monthlyCost: 85, displayName: '专业' },
  pro_plus: { cpu: 8, memoryMb: 16384, monthlyCost: 175, displayName: '专业增强' },
  custom: { cpu: 4, memoryMb: 8192, monthlyCost: 100, displayName: '自定义' },
};

// ===== Region Mapping =====
export const RENDER_REGIONS: { id: string; name: string }[] = [
  { id: 'oregon', name: 'Oregon (US West)' },
  { id: 'frankfurt', name: 'Frankfurt (EU Central)' },
  { id: 'ohio', name: 'Ohio (US East)' },
  { id: 'singapore', name: 'Singapore (Asia Pacific)' },
  { id: 'virginia', name: 'Virginia (US East)' },
];
