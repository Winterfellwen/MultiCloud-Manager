// Demo API 替换函数 - 提供与真实 API 兼容的接口
import {
  getAllDemoInstances,
  getDemoResources,
  getDemoAlerts,
  getDemoCostSummary,
  getDemoUsers,
  getDemoMetrics,
  getDemoCloudAccounts,
  updateDemoInstance,
  deleteDemoInstance,
  addDemoInstance,
  resetDemoInstances,
  deleteDemoResource,
  getDemoAuditLogs,
  getDemoTopology,
} from './mock-data';
import type { ListInstancesParams, InstanceRow, Instance, CreateInstanceParams } from '@/types/cloud';
import type { CloudResource } from '@/types/resource';

let _dashboardStatsCache: unknown = null;

export function demoListInstances(params?: ListInstancesParams): Promise<InstanceRow[]> {
  let list = getAllDemoInstances();
  if (params?.provider) list = list.filter((i) => i.provider === params.provider);
  if (params?.region) list = list.filter((i) => i.region === params.region);
  if (params?.status) list = list.filter((i) => i.status === params.status);
  const offset = params?.offset || 0;
  const limit = params?.limit || list.length;
  return Promise.resolve(list.slice(offset, offset + limit));
}

export function demoGetInstance(id: string): Promise<InstanceRow> {
  const inst = getAllDemoInstances().find((i) => i.id === id);
  if (!inst) throw new Error(`Instance ${id} not found`);
  return Promise.resolve(inst);
}

export function demoListResources(filters: {
  provider?: string;
  resourceType?: string;
  region?: string;
  limit?: number;
  offset?: number;
}): Promise<CloudResource[]> {
  let list = getDemoResources();
  if (filters.provider) list = list.filter((r) => r.provider === filters.provider);
  if (filters.resourceType) list = list.filter((r) => r.resourceType === filters.resourceType);
  if (filters.region) list = list.filter((r) => r.region === filters.region);
  const offset = filters.offset || 0;
  const limit = filters.limit || list.length;
  return Promise.resolve(list.slice(offset, offset + limit));
}

export function demoListAlerts() {
  return Promise.resolve(getDemoAlerts());
}

export function demoGetCostSummary(start: string, end: string) {
  return Promise.resolve(getDemoCostSummary(start, end));
}

export function demoListUsers() {
  return Promise.resolve(getDemoUsers());
}

export function demoGetMetrics(instanceId: string) {
  return Promise.resolve(getDemoMetrics(instanceId));
}

export function demoListCloudAccounts(): Promise<unknown[]> {
  return Promise.resolve(getDemoCloudAccounts() as unknown[]);
}

export function demoAuditLogs(query?: { userId?: string; action?: string; provider?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }): Promise<unknown[]> {
  let logs = getDemoAuditLogs();
  if (query?.userId) logs = logs.filter(l => l.userId.includes(query.userId!));
  if (query?.action) logs = logs.filter(l => l.action.includes(query.action!));
  if (query?.provider) logs = logs.filter(l => l.provider === query.provider);
  if (query?.startDate) logs = logs.filter(l => l.timestamp >= query.startDate!);
  if (query?.endDate) logs = logs.filter(l => l.timestamp <= query.endDate!);
  const offset = query?.offset || 0;
  const limit = query?.limit || logs.length;
  return Promise.resolve(logs.slice(offset, offset + limit) as unknown[]);
}

export function demoDashboardStats() {
  if (!_dashboardStatsCache) {
    const instances = getAllDemoInstances();
    const alerts = getDemoAlerts();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();
    const costs = getDemoCostSummary(monthStart, monthEnd);

    const byProvider: Record<string, number> = {};
    for (const inst of instances) {
      byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
    }

    _dashboardStatsCache = {
      totalInstances: instances.length,
      runningInstances: instances.filter((i) => i.status === 'running').length,
      alertCount: alerts.filter((a) => a.status === 'firing').length,
      monthlyCost: costs.reduce((sum, c) => sum + (c.currency === 'USD' ? c.totalAmount : c.totalAmount * 0.14), 0),
      byProvider,
      errors: { instances: false, alerts: false, costs: false },
    };
  }
  return Promise.resolve(_dashboardStatsCache);
}

// ===== Demo 写操作 =====
export function demoStartInstance(id: string): Promise<{ success: boolean; status: string }> {
  const updated = updateDemoInstance(id, { status: 'running' });
  if (!updated) throw new Error(`Instance ${id} not found`);
  return Promise.resolve({ success: true, status: 'running' });
}

export function demoStopInstance(id: string): Promise<{ success: boolean; status: string }> {
  const updated = updateDemoInstance(id, { status: 'stopped', publicIp: null });
  if (!updated) throw new Error(`Instance ${id} not found`);
  return Promise.resolve({ success: true, status: 'stopped' });
}

export function demoRebootInstance(id: string): Promise<{ success: boolean; status: string }> {
  const updated = updateDemoInstance(id, { status: 'pending' });
  if (!updated) throw new Error(`Instance ${id} not found`);
  // 模拟重启：pending -> running
  setTimeout(() => updateDemoInstance(id, { status: 'running' }), 2000);
  return Promise.resolve({ success: true, status: 'restarting' });
}

export function demoDeleteInstance(id: string): Promise<{ success: boolean }> {
  const ok = deleteDemoInstance(id);
  if (!ok) throw new Error(`Instance ${id} not found`);
  return Promise.resolve({ success: true });
}

export function demoCreateInstance(params: CreateInstanceParams): Promise<Instance> {
  const id = `demo-${params.provider}-${Date.now()}`;
  const newInst: InstanceRow = {
    id,
    provider: params.provider,
    providerInstanceId: `i-${params.provider}-${Date.now().toString(36)}`,
    name: params.name,
    region: params.region,
    status: 'pending',
    cpu: 2,
    memoryMb: 4096,
    diskGb: 40,
    publicIp: null,
    privateIp: `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    monthlyCost: '32.00',
    tags: { env: 'dev', team: 'Demo', project: 'cloudops' },
    lastSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    cloudAccountId: `demo-account-${params.provider}`,
  };
  addDemoInstance(newInst);
  // 模拟启动过程
  setTimeout(() => updateDemoInstance(id, { status: 'running', publicIp: `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}` }), 3000);
  // 返回 Instance 格式（spec 对象而非扁平字段）
  return Promise.resolve({
    id: newInst.id,
    provider: newInst.provider,
    providerInstanceId: newInst.providerInstanceId,
    name: newInst.name || '',
    region: newInst.region,
    status: newInst.status,
    spec: { cpu: newInst.cpu || 2, memoryMb: newInst.memoryMb || 4096, diskGb: newInst.diskGb || 40 },
    publicIp: newInst.publicIp,
    privateIp: newInst.privateIp,
    monthlyCost: parseFloat(newInst.monthlyCost || '0'),
    tags: newInst.tags || {},
    lastSyncedAt: newInst.lastSyncedAt || '',
    createdAt: newInst.createdAt || '',
  });
}

export function demoResetAll(): Promise<{ success: boolean }> {
  resetDemoInstances();
  _dashboardStatsCache = null;
  // 清除 localStorage 中的 demo 数据
  try {
    localStorage.removeItem('demo-chat-sessions');
    localStorage.removeItem('demo-chat-history');
  } catch { /* ignore */ }
  return Promise.resolve({ success: true });
}

export function demoDeleteResource(id: string): Promise<{ ok: boolean }> {
  const ok = deleteDemoResource(id);
  if (!ok) throw new Error(`Resource ${id} not found`);
  return Promise.resolve({ ok: true });
}

export function demoGetTopology(filters?: {
  provider?: string;
  region?: string;
  resourceType?: string;
  status?: string;
}): Promise<{ nodes: Array<{ id: string; type: string; label: string; provider: string; region: string; status: string; category: string; icon: string; data: Record<string, unknown> }>; edges: Array<{ id: string; source: string; target: string; type: string; label?: string }> }> {
  return Promise.resolve(getDemoTopology(filters));
}
