// Demo 模式 Mock 数据生成器
// 为 7 家云厂商生成大量模拟资源数据
import type { InstanceRow } from '@/types/cloud';
import type { CloudResource } from '@/types/resource';
import type { TopologyNode, TopologyEdge } from '@/types/topology';
import type { Team, TeamMember } from '@/types/team';

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
  teamId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export function getDemoUsers(): DemoUser[] {
  return [
    { id: 'demo-u-1', username: 'demo-admin', email: 'admin@demo.cloudops.io', role: 'admin', team: 'Platform', teamId: 'demo-team-1', createdAt: '2024-01-15T08:00:00Z', lastLoginAt: '2026-06-22T10:30:00Z' },
    { id: 'demo-u-2', username: 'demo-manager', email: 'manager@demo.cloudops.io', role: 'ops_manager', team: 'SRE', teamId: 'demo-team-2', createdAt: '2024-02-20T08:00:00Z', lastLoginAt: '2026-06-23T09:15:00Z' },
    { id: 'demo-u-3', username: 'demo-engineer-1', email: 'eng1@demo.cloudops.io', role: 'ops_engineer', team: 'DevOps', teamId: 'demo-team-3', createdAt: '2024-03-10T08:00:00Z', lastLoginAt: '2026-06-23T08:45:00Z' },
    { id: 'demo-u-4', username: 'demo-engineer-2', email: 'eng2@demo.cloudops.io', role: 'ops_engineer', team: 'Backend', teamId: 'demo-team-3', createdAt: '2024-04-05T08:00:00Z', lastLoginAt: '2026-06-22T16:20:00Z' },
    { id: 'demo-u-5', username: 'demo-viewer', email: 'viewer@demo.cloudops.io', role: 'viewer', team: 'Finance', teamId: null, createdAt: '2024-05-12T08:00:00Z', lastLoginAt: '2026-06-20T14:00:00Z' },
  ];
}

// ===== 团队 =====
let _teamsCache: Team[] | null = null;

export function getDemoTeams(): Team[] {
  if (!_teamsCache) {
    _teamsCache = [
      { id: 'demo-team-1', name: 'Platform', createdAt: '2024-01-15T08:00:00Z' },
      { id: 'demo-team-2', name: 'SRE', createdAt: '2024-02-20T08:00:00Z' },
      { id: 'demo-team-3', name: 'DevOps', createdAt: '2024-03-10T08:00:00Z' },
      { id: 'demo-team-4', name: 'Backend', createdAt: '2024-04-05T08:00:00Z' },
      { id: 'demo-team-5', name: 'Frontend', createdAt: '2024-05-12T08:00:00Z' },
      { id: 'demo-team-6', name: 'Data', createdAt: '2024-06-01T08:00:00Z' },
    ];
  }
  return _teamsCache;
}

export function getDemoTeamById(id: string): Team | null {
  return getDemoTeams().find(t => t.id === id) || null;
}

export function addDemoTeam(team: Team): void {
  getDemoTeams().push(team);
}

export function updateDemoTeam(id: string, updates: Partial<Team>): Team | null {
  const list = getDemoTeams();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...updates };
  list[idx] = updated;
  return updated;
}

export function deleteDemoTeam(id: string): boolean {
  const list = getDemoTeams();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

export function getDemoTeamMembers(teamId: string): TeamMember[] {
  const users = getDemoUsers();
  return users
    .filter(u => u.teamId === teamId)
    .map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      team: u.team,
      teamId: u.teamId,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
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

// ===== 审计日志 =====
export interface DemoAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: 'success' | 'failure';
  ip: string | null;
  traceId: string | null;
}

export function getDemoAuditLogs(): DemoAuditLog[] {
  const now = Date.now();
  const logs: DemoAuditLog[] = [
    {
      id: 'demo-audit-1',
      timestamp: new Date(now - 1000 * 60 * 5).toISOString(),
      userId: 'demo-u-1',
      action: 'instance.start',
      resourceType: 'instance',
      resourceId: 'demo-aws-1',
      provider: 'aws',
      region: 'us-east-1',
      params: { instanceId: 'demo-aws-1' },
      result: 'success',
      ip: '192.168.1.100',
      traceId: 'trace-001',
    },
    {
      id: 'demo-audit-2',
      timestamp: new Date(now - 1000 * 60 * 15).toISOString(),
      userId: 'demo-u-2',
      action: 'instance.stop',
      resourceType: 'instance',
      resourceId: 'demo-aliyun-2',
      provider: 'aliyun',
      region: 'cn-hangzhou',
      params: { instanceId: 'demo-aliyun-2', reason: 'maintenance' },
      result: 'success',
      ip: '10.0.0.50',
      traceId: 'trace-002',
    },
    {
      id: 'demo-audit-3',
      timestamp: new Date(now - 1000 * 60 * 30).toISOString(),
      userId: 'demo-u-3',
      action: 'instance.create',
      resourceType: 'instance',
      resourceId: 'demo-azure-1',
      provider: 'azure',
      region: 'eastus',
      params: { name: 'web-server-01', size: 'Standard_D2s_v3' },
      result: 'success',
      ip: '172.16.0.25',
      traceId: 'trace-003',
    },
    {
      id: 'demo-audit-4',
      timestamp: new Date(now - 1000 * 60 * 60).toISOString(),
      userId: 'demo-u-1',
      action: 'instance.delete',
      resourceType: 'instance',
      resourceId: 'demo-tencent-1',
      provider: 'tencent',
      region: 'ap-guangzhou',
      params: { instanceId: 'demo-tencent-1' },
      result: 'failure',
      ip: '192.168.1.100',
      traceId: 'trace-004',
    },
    {
      id: 'demo-audit-5',
      timestamp: new Date(now - 1000 * 60 * 120).toISOString(),
      userId: 'demo-u-4',
      action: 'cloud_account.sync',
      resourceType: 'cloud_account',
      resourceId: 'demo-acc-aws',
      provider: 'aws',
      region: null,
      params: { accountId: 'demo-acc-aws' },
      result: 'success',
      ip: '10.1.0.10',
      traceId: 'trace-005',
    },
    {
      id: 'demo-audit-6',
      timestamp: new Date(now - 1000 * 60 * 180).toISOString(),
      userId: 'demo-u-2',
      action: 'alert.acknowledge',
      resourceType: 'alert',
      resourceId: 'demo-alert-1',
      provider: 'aws',
      region: 'us-east-1',
      params: { alertId: 'demo-alert-1', message: 'High CPU usage' },
      result: 'success',
      ip: '10.0.0.50',
      traceId: 'trace-006',
    },
    {
      id: 'demo-audit-7',
      timestamp: new Date(now - 1000 * 60 * 240).toISOString(),
      userId: 'demo-u-1',
      action: 'user.login',
      resourceType: 'user',
      resourceId: 'demo-u-1',
      provider: null,
      region: null,
      params: { username: 'demo-admin' },
      result: 'success',
      ip: '192.168.1.100',
      traceId: 'trace-007',
    },
    {
      id: 'demo-audit-8',
      timestamp: new Date(now - 1000 * 60 * 300).toISOString(),
      userId: 'demo-u-5',
      action: 'instance.reboot',
      resourceType: 'instance',
      resourceId: 'demo-huawei-1',
      provider: 'huawei',
      region: 'cn-north-1',
      params: { instanceId: 'demo-huawei-1' },
      result: 'success',
      ip: '10.2.0.30',
      traceId: 'trace-008',
    },
  ];
  return logs;
}

// ===== 拓扑模拟数据（250-350 nodes） =====
const TOPOLOGY_PROVIDERS = ['aws', 'aliyun', 'azure', 'huawei', 'tencent'] as const;
const TOPOLOGY_TEAMS = ['frontend', 'backend', 'data', 'devops', 'ml'];

let _topologyCache: { nodes: TopologyNode[]; edges: TopologyEdge[] } | null = null;

export function getDemoTopology(filters?: {
  provider?: string;
  region?: string;
  resourceType?: string;
  status?: string;
  cloudAccountId?: string;
}): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  if (!_topologyCache) {
    const rand = seededRandom(789);
    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];
    let nodeIdx = 0;

    // --- Per-provider scaffolding ---
    const providerVpcs: Record<string, Array<{ id: string; region: string; cloudAccountId: string }>> = {};
    const providerSubnets: Record<string, Array<{ id: string; region: string; vpcId: string; cloudAccountId: string }>> = {};
    const providerInstances: Record<string, Array<{ id: string; region: string; cloudAccountId: string }>> = {};

    for (const provider of TOPOLOGY_PROVIDERS) {
      providerVpcs[provider] = [];
      providerSubnets[provider] = [];
      providerInstances[provider] = [];
    }

    // --- VPCs (2-4 per provider, ~15 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      const vpcCount = 2 + Math.floor(rand() * 3); // 2-4
      for (let i = 0; i < vpcCount; i++) {
        const id = `demo-vpc-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'vpc',
          label: `${provider.toUpperCase()}-VPC-${i + 1}`,
          provider,
          region,
          status: 'active',
          category: 'network',
          icon: 'git-branch',
          data: {
            cidrBlock: `10.${TOPOLOGY_PROVIDERS.indexOf(provider) * 4 + i}.0.0/16`,
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
          },
        });
        providerVpcs[provider].push({ id, region, cloudAccountId });
      }
    }

    // --- Subnets (2-3 per VPC, ~35 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      for (const vpc of providerVpcs[provider]) {
        const subnetCount = 2 + Math.floor(rand() * 2); // 2-3
        for (let i = 0; i < subnetCount; i++) {
          const id = `demo-subnet-${nodeIdx++}`;
          nodes.push({
            id,
            type: 'subnet',
            label: `Subnet-${vpc.id.split('-').pop()}-${i + 1}`,
            provider,
            region: vpc.region,
            status: 'active',
            category: 'network',
            icon: 'git-branch',
            data: {
              cidrBlock: `10.${vpc.id.split('-').pop()}.${i}.0/24`,
              cloudAccountId: vpc.cloudAccountId,
              team: pick(TOPOLOGY_TEAMS, rand),
            },
          });
          edges.push({
            id: `edge-${id}-${vpc.id}`,
            source: id,
            target: vpc.id,
            type: 'contains',
            label: '位于',
          });
          providerSubnets[provider].push({ id, region: vpc.region, vpcId: vpc.id, cloudAccountId: vpc.cloudAccountId });
        }
      }
    }

    // --- Instances (5-10 per subnet, ~250 total) ---
    const INSTANCE_SPECS_TOPO = [
      { cpu: 1, memoryMb: 2048, diskGb: 20, monthlyCostMin: 10, monthlyCostMax: 50 },
      { cpu: 2, memoryMb: 4096, diskGb: 40, monthlyCostMin: 30, monthlyCostMax: 120 },
      { cpu: 4, memoryMb: 8192, diskGb: 80, monthlyCostMin: 80, monthlyCostMax: 300 },
      { cpu: 8, memoryMb: 16384, diskGb: 160, monthlyCostMin: 200, monthlyCostMax: 500 },
    ];
    for (const provider of TOPOLOGY_PROVIDERS) {
      for (const subnet of providerSubnets[provider]) {
        const instanceCount = 4 + Math.floor(rand() * 5); // 4-8
        for (let i = 0; i < instanceCount; i++) {
          const id = `demo-instance-${nodeIdx++}`;
          const status = weightedPick(['running', 'stopped', 'pending', 'error'], [0.6, 0.2, 0.15, 0.05], rand);
          const spec = pick(INSTANCE_SPECS_TOPO, rand);
          const cost = Math.floor(spec.monthlyCostMin + rand() * (spec.monthlyCostMax - spec.monthlyCostMin));
          nodes.push({
            id,
            type: 'instance',
            label: `${provider}-inst-${String(providerInstances[provider].length + 1).padStart(3, '0')}`,
            provider,
            region: subnet.region,
            status,
            category: 'compute',
            icon: 'server',
            data: {
              cpu: spec.cpu,
              memoryMb: spec.memoryMb,
              diskGb: spec.diskGb,
              cloudAccountId: subnet.cloudAccountId,
              monthlyCost: cost,
              team: pick(TOPOLOGY_TEAMS, rand),
            },
          });
          edges.push({
            id: `edge-${id}-${subnet.id}`,
            source: id,
            target: subnet.id,
            type: 'contains',
            label: '位于',
          });
          providerInstances[provider].push({ id, region: subnet.region, cloudAccountId: subnet.cloudAccountId });
        }
      }
    }

    // --- Security Groups (2 per VPC, ~30 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      for (const vpc of providerVpcs[provider]) {
        for (let i = 0; i < 2; i++) {
          const id = `demo-sg-${nodeIdx++}`;
          nodes.push({
            id,
            type: 'securitygroup',
            label: `SG-${provider}-${vpc.id.split('-').pop()}-${i + 1}`,
            provider,
            region: vpc.region,
            status: 'active',
            category: 'security',
            icon: 'shield',
            data: {
              ruleCount: 5 + Math.floor(rand() * 10),
              cloudAccountId: vpc.cloudAccountId,
              team: pick(TOPOLOGY_TEAMS, rand),
            },
          });
          edges.push({
            id: `edge-${id}-${vpc.id}`,
            source: id,
            target: vpc.id,
            type: 'contains',
            label: '位于',
          });
          // Connect some instances to this SG
          const regionInstances = providerInstances[provider].filter(inst => inst.region === vpc.region);
          const sgInstances = regionInstances.filter(() => rand() > 0.6).slice(0, 4);
          for (const inst of sgInstances) {
            edges.push({
              id: `edge-${inst.id}-${id}`,
              source: inst.id,
              target: id,
              type: 'protected-by',
              label: '受保护',
            });
          }
        }
      }
    }

    // --- Load Balancers (1-2 per provider, ~8 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      const lbCount = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < lbCount; i++) {
        const id = `demo-lb-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'loadbalancer',
          label: `${provider.toUpperCase()}-LB-${i + 1}`,
          provider,
          region,
          status: 'active',
          category: 'network',
          icon: 'share-2',
          data: {
            type: pick(['application', 'network'], rand),
            scheme: pick(['internet-facing', 'internal'], rand),
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
            monthlyCost: Math.floor(50 + rand() * 200),
          },
        });
        // Route to up to 5 instances in same region
        const regionInstances = providerInstances[provider].filter(inst => inst.region === region);
        const targets = regionInstances.filter(() => rand() > 0.5).slice(0, 5);
        for (const inst of targets) {
          edges.push({
            id: `edge-${id}-${inst.id}`,
            source: id,
            target: inst.id,
            type: 'routes-to',
            label: '转发',
          });
        }
      }
    }

    // --- Databases (1-2 per provider, ~8 total) ---
    const DB_ENGINES = ['mysql', 'postgresql', 'mongodb', 'mariadb', 'oracle'];
    for (const provider of TOPOLOGY_PROVIDERS) {
      const dbCount = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < dbCount; i++) {
        const id = `demo-db-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const vpc = providerVpcs[provider].find(v => v.region === region) || providerVpcs[provider][0];
        const cloudAccountId = `demo-${provider}-account`;
        const cost = Math.floor(50 + rand() * 1950); // $50-$2000
        nodes.push({
          id,
          type: 'database',
          label: `${provider.toUpperCase()}-DB-${i + 1}`,
          provider,
          region,
          status: weightedPick(['active', 'stopped', 'pending'], [0.8, 0.1, 0.1], rand),
          category: 'database',
          icon: 'database',
          data: {
            engine: pick(DB_ENGINES, rand),
            engineVersion: pick(['8.0', '13.0', '5.7', '14.0'], rand),
            cloudAccountId,
            monthlyCost: cost,
            team: pick(TOPOLOGY_TEAMS, rand),
          },
        });
        if (vpc) {
          edges.push({
            id: `edge-${id}-${vpc.id}`,
            source: id,
            target: vpc.id,
            type: 'contains',
            label: '位于',
          });
        }
      }
    }

    // --- Object Storage Buckets (2-3 per provider, ~12 total) ---
    const STORAGE_CLASSES = ['standard', 'standard-ia', 'glacier', 'cold'];
    for (const provider of TOPOLOGY_PROVIDERS) {
      const bucketCount = 2 + Math.floor(rand() * 2); // 2-3
      for (let i = 0; i < bucketCount; i++) {
        const id = `demo-bucket-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'bucket',
          label: `${provider.toUpperCase()}-Bucket-${i + 1}`,
          provider,
          region,
          status: 'active',
          category: 'storage',
          icon: 'database',
          data: {
            storageClass: pick(STORAGE_CLASSES, rand),
            sizeBytes: Math.floor(rand() * 5000000000),
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
            monthlyCost: Math.floor(1 + rand() * 50),
          },
        });
      }
    }

    // --- Cache (1-2 per provider, ~6 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      const cacheCount = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < cacheCount; i++) {
        const id = `demo-cache-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'cache',
          label: `${provider.toUpperCase()}-Redis-${i + 1}`,
          provider,
          region,
          status: 'active',
          category: 'database',
          icon: 'zap',
          data: {
            engine: 'redis',
            engineVersion: pick(['6.2', '7.0'], rand),
            memoryMb: pick([256, 512, 1024, 2048, 4096], rand),
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
            monthlyCost: Math.floor(10 + rand() * 300),
          },
        });
      }
    }

    // --- CDN (1-2 per provider, ~6 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      const cdnCount = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < cdnCount; i++) {
        const id = `demo-cdn-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'cdn',
          label: `${provider.toUpperCase()}-CDN-${i + 1}`,
          provider,
          region,
          status: 'active',
          category: 'cdn',
          icon: 'globe',
          data: {
            domain: `${provider}-cdn-${i + 1}.example.com`,
            protocol: pick(['http', 'https'], rand),
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
            monthlyCost: Math.floor(20 + rand() * 180),
          },
        });
      }
    }

    // --- Containers (1-2 per provider, ~6 total) ---
    for (const provider of TOPOLOGY_PROVIDERS) {
      const containerCount = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < containerCount; i++) {
        const id = `demo-container-${nodeIdx++}`;
        const region = pick(PROVIDER_REGIONS[provider], rand);
        const cloudAccountId = `demo-${provider}-account`;
        nodes.push({
          id,
          type: 'cluster',
          label: `${provider.toUpperCase()}-K8s-${i + 1}`,
          provider,
          region,
          status: pick(['active', 'pending', 'error'], rand),
          category: 'container',
          icon: 'box',
          data: {
            runtime: pick(['kubernetes', 'docker', 'ecs'], rand),
            nodeCount: 3 + Math.floor(rand() * 8),
            cloudAccountId,
            team: pick(TOPOLOGY_TEAMS, rand),
            monthlyCost: Math.floor(100 + rand() * 900),
          },
        });
      }
    }

    // --- AI Services (1 per provider, ~5 total) ---
    const AI_SERVICES = ['NLP', 'Vision', 'Speech', 'Recommendation', 'Training', 'Inference'];
    for (const provider of TOPOLOGY_PROVIDERS) {
      const id = `demo-ai-${nodeIdx++}`;
      const region = pick(PROVIDER_REGIONS[provider], rand);
      const cloudAccountId = `demo-${provider}-account`;
      nodes.push({
        id,
        type: 'aiservice',
        label: `${provider.toUpperCase()}-AI-${pick(AI_SERVICES, rand)}`,
        provider,
        region,
        status: pick(['active', 'pending'], rand),
        category: 'ai',
        icon: 'cpu',
        data: {
          serviceType: pick(AI_SERVICES, rand),
          model: pick(['gpt-4', 'llama-3', 'bert', 'resnet', 'custom'], rand),
          cloudAccountId,
          team: 'ml',
          monthlyCost: Math.floor(200 + rand() * 1800),
        },
      });
    }

    _topologyCache = { nodes, edges };
  }

  // Apply filters
  let filteredNodes = _topologyCache.nodes;
  let filteredEdges = _topologyCache.edges;

  if (filters?.provider) {
    const nodeIds = new Set(filteredNodes.filter(n => n.provider === filters.provider).map(n => n.id));
    filteredNodes = filteredNodes.filter(n => nodeIds.has(n.id));
    filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.region) {
    const nodeIds = new Set(filteredNodes.filter(n => n.region === filters.region).map(n => n.id));
    filteredNodes = filteredNodes.filter(n => nodeIds.has(n.id));
    filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.resourceType) {
    const nodeIds = new Set(filteredNodes.filter(n => n.type === filters.resourceType).map(n => n.id));
    filteredNodes = filteredNodes.filter(n => nodeIds.has(n.id));
    filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.status) {
    const nodeIds = new Set(filteredNodes.filter(n => n.status === filters.status).map(n => n.id));
    filteredNodes = filteredNodes.filter(n => nodeIds.has(n.id));
    filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.cloudAccountId) {
    const nodeIds = new Set(filteredNodes.filter(n => n.data.cloudAccountId === filters.cloudAccountId).map(n => n.id));
    filteredNodes = filteredNodes.filter(n => nodeIds.has(n.id));
    filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ===== 实例日志 =====
export interface DemoLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const LOG_MESSAGES = {
  info: [
    'Health check passed',
    'Instance started successfully',
    'Configuration reloaded',
    'Connection pool resized',
    'Cache invalidated',
    'Request processed successfully',
    'TLS certificate renewed',
    'Backup completed',
  ],
  warn: [
    'CPU usage above 80%',
    'Memory usage above 75%',
    'Disk space below 20%',
    'Connection pool nearing limit',
    'Response time degraded',
    'Rate limit approaching',
  ],
  error: [
    'Connection refused',
    'Out of memory',
    'Disk full',
    'Service unavailable',
    'Authentication failed',
    'Timeout exceeded',
  ],
};

export function getDemoLogs(_instanceId: string, count = 30): DemoLogEntry[] {
  const logs: DemoLogEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const level = r < 0.7 ? 'info' : r < 0.9 ? 'warn' : 'error';
    const msgs = LOG_MESSAGES[level];
    logs.push({
      timestamp: new Date(now - i * 30000 - Math.random() * 10000).toISOString(),
      level,
      message: msgs[Math.floor(Math.random() * msgs.length)],
    });
  }
  return logs;
}
