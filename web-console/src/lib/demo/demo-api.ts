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
} from './mock-data';
import type { ListInstancesParams, InstanceRow, CreateInstanceParams } from '@/types/cloud';
import type { CloudResource } from '@/types/resource';

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

export function demoDashboardStats() {
  const instances = getAllDemoInstances();
  const alerts = getDemoAlerts();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();
  const costs = getDemoCostSummary(monthStart, monthEnd);

  const byProvider: Record<string, number> = {};
  for (const inst of instances) {
    byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
  }

  return Promise.resolve({
    totalInstances: instances.length,
    runningInstances: instances.filter((i) => i.status === 'running').length,
    alertCount: alerts.filter((a) => a.status === 'firing').length,
    monthlyCost: costs.reduce((sum, c) => sum + (c.currency === 'USD' ? c.totalAmount : c.totalAmount * 0.14), 0),
    byProvider,
    errors: { instances: false, alerts: false, costs: false },
  });
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

export function demoCreateInstance(params: CreateInstanceParams): Promise<InstanceRow> {
  const list = getAllDemoInstances();
  const newInst: InstanceRow = {
    id: `demo-${params.provider}-${Date.now()}`,
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
  setTimeout(() => updateDemoInstance(newInst.id, { status: 'running', publicIp: `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}` }), 3000);
  return Promise.resolve(newInst);
}

export function demoResetAll(): Promise<{ success: boolean }> {
  resetDemoInstances();
  // 清除 localStorage 中的 demo 数据
  try {
    localStorage.removeItem('demo-chat-sessions');
    localStorage.removeItem('demo-chat-history');
  } catch { /* ignore */ }
  return Promise.resolve({ success: true });
}
