// Demo 模式 Mock 数据生成器
// 为 7 家云厂商生成大量模拟资源数据
import type { InstanceRow } from '@/types/cloud';
import type { CloudResource } from '@/types/resource';

// ===== 工具函数 =====
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function weightedPick<T>(arr: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function generateIP(rand: () => number): string {
  return `10.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}`;
}

function randomDate(daysAgo: number, rand: () => number): string {
  const ms = Date.now() - Math.floor(rand() * daysAgo * 86400000);
  return new Date(ms).toISOString();
}

// ===== 云厂商配置 =====
const PROVIDER_REGIONS: Record<string, string[]> = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1'],
  aliyun: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing'],
  azure: ['eastus', 'westus2', 'europewest', 'asiaeast'],
  tencent: ['ap-guangzhou', 'ap-shanghai', 'ap-beijing'],
  huawei: ['cn-north-4', 'cn-east-3', 'cn-south-1'],
  render: ['oregon', 'singapore', 'frankfurt'],
  oracle: ['us-ashburn-1', 'ap-tokyo-1', 'eu-frankfurt-1'],
};

const PROVIDER_INSTANCE_COUNTS: Record<string, number> = {
  aws: 80,
  aliyun: 50,
  azure: 40,
  tencent: 30,
  huawei: 30,
  render: 20,
  oracle: 50,
};

const INSTANCE_SPECS = [
  { cpu: 1, memoryMb: 2048, diskGb: 20, monthlyCost: 8 },
  { cpu: 2, memoryMb: 4096, diskGb: 40, monthlyCost: 32 },
  { cpu: 4, memoryMb: 8192, diskGb: 80, monthlyCost: 128 },
  { cpu: 8, memoryMb: 16384, diskGb: 160, monthlyCost: 512 },
  { cpu: 16, memoryMb: 32768, diskGb: 320, monthlyCost: 1024 },
];

const STATUSES: Array<'running' | 'stopped' | 'pending' | 'error'> = ['running', 'stopped', 'pending', 'error'];
const STATUS_WEIGHTS = [0.6, 0.2, 0.15, 0.05];

const TEAMS = ['SRE', 'DevOps', 'Backend', 'Frontend', 'Data', 'Platform'];
const ENVS = ['prod', 'staging', 'dev'];
const PROJECTS = ['cloudops', 'platform', 'analytics', 'api', 'web'];

// ===== 实例生成 =====
export function generateInstances(provider: string): InstanceRow[] {
  const count = PROVIDER_INSTANCE_COUNTS[provider] || 100;
  const regions = PROVIDER_REGIONS[provider] || ['us-east-1'];
  const rand = seededRandom(provider.charCodeAt(0) * 1000 + count);

  return Array.from({ length: count }, (_, i) => {
    const spec = pick(INSTANCE_SPECS, rand);
    const status = weightedPick(STATUSES, STATUS_WEIGHTS, rand);
    const region = pick(regions, rand);
    const createdAt = randomDate(180, rand);
    const team = pick(TEAMS, rand);
    const env = pick(ENVS, rand);
    const project = pick(PROJECTS, rand);

    return {
      id: `demo-${provider}-${i}`,
      provider,
      providerInstanceId: `i-${provider}-${i.toString().padStart(4, '0')}`,
      name: `${provider}-${env}-${project}-${i.toString().padStart(4, '0')}`,
      region,
      status,
      cpu: spec.cpu,
      memoryMb: spec.memoryMb,
      diskGb: spec.diskGb,
      publicIp: status === 'running' ? generateIP(rand) : null,
      privateIp: generateIP(rand),
      monthlyCost: spec.monthlyCost.toFixed(2),
      tags: { env, team, project, managedBy: 'cloudops' },
      lastSyncedAt: new Date().toISOString(),
      createdAt,
      cloudAccountId: `demo-account-${provider}`,
    };
  });
}

// ===== 所有实例（可变，支持 demo CRUD + 一键还原） =====
let _instancesCache: InstanceRow[] | null = null;
function generateAllInstances(): InstanceRow[] {
  return Object.keys(PROVIDER_INSTANCE_COUNTS).flatMap(generateInstances);
}
export function getAllDemoInstances(): InstanceRow[] {
  if (!_instancesCache) {
    _instancesCache = generateAllInstances();
  }
  return _instancesCache;
}
export function resetDemoInstances(): void {
  _instancesCache = generateAllInstances();
  _resourcesCache = null;
  _alertsCache = null;
  _costsCache = null;
  _metricsCache.clear();
}
export function updateDemoInstance(id: string, updates: Partial<InstanceRow>): InstanceRow | null {
  const list = getAllDemoInstances();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...updates };
  list[idx] = updated;
  return updated;
}
export function deleteDemoInstance(id: string): boolean {
  const list = getAllDemoInstances();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
export function addDemoInstance(inst: InstanceRow): void {
  getAllDemoInstances().push(inst);
}

// ===== 资源生成 =====
const RESOURCE_COUNTS: Record<string, { count: number; type: CloudResource['resourceType'] }> = {
  aws: { count: 85, type: 'instance' },
  aliyun: { count: 53, type: 'instance' },
  azure: { count: 47, type: 'instance' },
  tencent: { count: 36, type: 'instance' },
  huawei: { count: 35, type: 'instance' },
  render: { count: 50, type: 'instance' },
  oracle: { count: 45, type: 'instance' },
};

let _resourcesCache: CloudResource[] | null = null;

export function getDemoResources(): CloudResource[] {
  if (!_resourcesCache) {
    const rand = seededRandom(42);
    const resources: CloudResource[] = [];
    let idx = 0;
    for (const [provider, { count, type }] of Object.entries(RESOURCE_COUNTS)) {
      const regions = PROVIDER_REGIONS[provider] || ['us-east-1'];
      for (let i = 0; i < count; i++) {
        resources.push({
          id: `demo-res-${idx++}`,
          provider,
          resourceType: type,
          name: `${provider}-${type}-${i.toString().padStart(3, '0')}`,
          region: pick(regions, rand),
          status: pick(['active', 'stopped', 'pending'], rand),
          attributes: {},
          tags: { env: pick(ENVS, rand), team: pick(TEAMS, rand) },
          createdAt: randomDate(90, rand),
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }
    _resourcesCache = resources;
  }
  return _resourcesCache;
}

export function deleteDemoResource(id: string): boolean {
  const list = getDemoResources();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ===== 告警 =====
export interface DemoAlert {
  id: string;
  ruleId: string;
  instanceId: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  status: 'firing' | 'resolved';
  firedAt: string;
  resolvedAt: string | null;
}

const ALERT_TEMPLATES = [
  { severity: 'critical' as const, message: 'CPU 使用率超过 95%', count: 3 },
  { severity: 'warning' as const, message: 'CPU 使用率超过 85%', count: 2 },
  { severity: 'warning' as const, message: '内存使用率超过 85%', count: 4 },
  { severity: 'warning' as const, message: '磁盘使用率超过 80%', count: 3 },
  { severity: 'info' as const, message: '网络流量异常', count: 2 },
  { severity: 'critical' as const, message: '服务无响应', count: 1 },
];

let _alertsCache: DemoAlert[] | null = null;

export function getDemoAlerts(): DemoAlert[] {
  if (!_alertsCache) {
    const rand = seededRandom(123);
    const alerts: DemoAlert[] = [];
    let idx = 0;
    for (const tmpl of ALERT_TEMPLATES) {
      for (let i = 0; i < tmpl.count; i++) {
        const instances = getAllDemoInstances();
        const inst = pick(instances, rand);
        alerts.push({
          id: `demo-alert-${idx++}`,
          ruleId: `demo-rule-${idx}`,
          instanceId: inst.id,
          severity: tmpl.severity,
          message: `${inst.name}: ${tmpl.message}`,
          status: 'firing',
          firedAt: randomDate(7, rand),
          resolvedAt: null,
        });
      }
    }
    _alertsCache = alerts;
  }
  return _alertsCache;
}

// ===== 成本 =====
export interface DemoCostSummary {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  breakdown: { service: string; amount: number }[];
}

const COST_DATA: Record<string, { amount: number; currency: string; services: string[] }> = {
  aws: { amount: 15000, currency: 'USD', services: ['EC2', 'RDS', 'S3', 'Lambda', 'CloudFront'] },
  aliyun: { amount: 8000, currency: 'CNY', services: ['ECS', 'RDS', 'OSS', 'CDN', '函数计算'] },
  azure: { amount: 12000, currency: 'USD', services: ['VM', 'SQL Database', 'Storage', 'AKS'] },
  tencent: { amount: 5000, currency: 'CNY', services: ['CVM', 'MySQL', 'COS', 'CLB'] },
  huawei: { amount: 4000, currency: 'CNY', services: ['ECS', 'RDS', 'OBS'] },
  render: { amount: 500, currency: 'USD', services: ['Web Service', 'PostgreSQL', 'Redis'] },
  oracle: { amount: 8000, currency: 'USD', services: ['Compute', 'Autonomous DB', 'Object Storage', 'OKE'] },
};

let _costsCache: DemoCostSummary[] | null = null;

export function getDemoCostSummary(start: string, end: string): DemoCostSummary[] {
  if (!_costsCache) {
    const rand = seededRandom(456);
    _costsCache = Object.entries(COST_DATA).map(([provider, data]) => {
      const total = data.amount * (0.9 + rand() * 0.2);
      return {
        provider,
        totalAmount: Math.round(total * 100) / 100,
        currency: data.currency,
        periodStart: start,
        periodEnd: end,
        breakdown: data.services.map((service) => ({
          service,
          amount: Math.round(total * (0.1 + rand() * 0.3) * 100) / 100,
        })),
      };
    });
  }
  return _costsCache;
}

// ===== 用户 =====
export interface DemoUser {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';
  team: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function getDemoUsers(): DemoUser[] {
  return [
    { id: 'demo-u-1', username: 'demo-admin', email: 'admin@demo.cloudops.io', role: 'admin', team: 'Platform', createdAt: '2024-01-15T08:00:00Z', lastLoginAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-u-2', username: 'demo-manager', email: 'manager@demo.cloudops.io', role: 'ops_manager', team: 'SRE', createdAt: '2024-02-20T08:00:00Z', lastLoginAt: '2026-06-23T09:15:00Z' },
    { id: 'demo-u-3', username: 'demo-engineer-1', email: 'eng1@demo.cloudops.io', role: 'ops_engineer', team: 'DevOps', createdAt: '2024-03-10T08:00:00Z', lastLoginAt: '2026-06-23T08:45:00Z' },
    { id: 'demo-u-4', username: 'demo-engineer-2', email: 'eng2@demo.cloudops.io', role: 'ops_engineer', team: 'Backend', createdAt: '2024-04-05T08:00:00Z', lastLoginAt: '2026-06-22T16:20:00Z' },
    { id: 'demo-u-5', username: 'demo-viewer', email: 'viewer@demo.cloudops.io', role: 'viewer', team: 'Finance', createdAt: '2024-05-12T08:00:00Z', lastLoginAt: '2026-06-20T14:00:00Z' },
  ];
}

// ===== 监控时间序列 =====
export interface DemoMetricPoint {
  timestamp: string;
  value: number;
  unit: string;
}

const _metricsCache = new Map<string, DemoMetricPoint[]>();

export function getDemoMetrics(instanceId: string, hours: number = 24): DemoMetricPoint[] {
  const key = `${instanceId}:${hours}`;
  if (!_metricsCache.has(key)) {
    const rand = seededRandom(instanceId.charCodeAt(instanceId.length - 1) * 7);
    const points: DemoMetricPoint[] = [];
    const now = Date.now();
    for (let h = hours; h >= 0; h--) {
      const base = 40 + Math.sin(h / 4) * 20;
      const noise = (rand() - 0.5) * 15;
      points.push({
        timestamp: new Date(now - h * 3600000).toISOString(),
        value: Math.max(0, Math.min(100, base + noise)),
        unit: 'percent',
      });
    }
    _metricsCache.set(key, points);
  }
  return _metricsCache.get(key)!;
}

// ===== 云账号 =====
export interface DemoCloudAccount {
  id: string;
  name: string;
  provider: string;
  config: Record<string, unknown>;
  credentialHint?: Record<string, string>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function getDemoCloudAccounts(): DemoCloudAccount[] {
  return [
    { id: 'demo-acc-aws', name: '生产环境 AWS', provider: 'aws', config: {}, credentialHint: { accessKeyId: 'AKIA****wX9z' }, status: 'active', createdAt: '2024-01-15T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-aliyun', name: '生产环境阿里云', provider: 'aliyun', config: {}, credentialHint: { accessKeyId: 'LTAI****X4nQ' }, status: 'active', createdAt: '2024-01-20T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-azure', name: '生产环境 Azure', provider: 'azure', config: {}, credentialHint: { clientId: '0000****0001' }, status: 'active', createdAt: '2024-02-01T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-tencent', name: '生产环境腾讯云', provider: 'tencent', config: {}, credentialHint: { secretId: 'AKID****kL2m' }, status: 'active', createdAt: '2024-02-10T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-huawei', name: '生产环境华为云', provider: 'huawei', config: {}, credentialHint: { accessKeyId: 'AK****Hp7' }, status: 'active', createdAt: '2024-03-01T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-render', name: 'Demo Render', provider: 'render', config: {}, credentialHint: { apiKey: 'rnd_****bX2k' }, status: 'active', createdAt: '2024-04-15T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-acc-oracle', name: 'Demo Oracle', provider: 'oracle', config: {}, credentialHint: { userOcid: 'ocid1.user****' }, status: 'active', createdAt: '2024-05-01T08:00:00Z', updatedAt: '2026-06-22T10:30:00Z' },
  ];
}
