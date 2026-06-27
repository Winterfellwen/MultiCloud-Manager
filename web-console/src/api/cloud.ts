import { api } from './client';
import type {
  InstanceRow, CreateInstanceParams, Instance, InstanceActionResponse,
  ListInstancesParams, ProviderRegion, ProviderImage, ProviderInstanceType,
  CloudAccount, SyncResult, TestConnectionResult, ProviderMeta,
} from '@/types/cloud';

export const cloudApi = {
  listInstances: (params?: ListInstancesParams) => {
    const query = new URLSearchParams();
    if (params?.provider) query.set('provider', params.provider);
    if (params?.region) query.set('region', params.region);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return api.get<InstanceRow[]>(`/cloud/instances/${qs ? '?' + qs : ''}`);
  },
  getInstance: (id: string) => api.get<InstanceRow>(`/cloud/instances/${id}`),
  createInstance: (params: CreateInstanceParams) => api.post<Instance>('/cloud/instances/', params),
  startInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/start`, {}),
  stopInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/stop`, {}),
  rebootInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/reboot`, {}),
  deleteInstance: (id: string) => api.delete<{ ok: true; id: string }>(`/cloud/instances/${id}`),
  syncInstances: (provider?: string) =>
    api.post<SyncResult[]>(`/cloud/instances/sync${provider ? '?provider=' + provider : ''}`, {}),
  getProviders: () => api.get<{ providers: string[] }>('/cloud/providers/'),
  /** 获取支持的云厂商元数据（用于前端动态渲染表单） */
  getProvidersMeta: () => api.get<{ providers: ProviderMeta[] }>('/cloud/providers/meta'),
  getRegions: (provider: string) => api.get<ProviderRegion[]>(`/cloud/providers/${provider}/regions`),
  getImages: (provider: string) => api.get<ProviderImage[]>(`/cloud/providers/${provider}/images`),
  getInstanceTypes: (provider: string, region: string) =>
    api.get<ProviderInstanceType[]>(`/cloud/providers/${provider}/instance-types/${region}`),
  listAccounts: () => api.get<CloudAccount[]>('/cloud/accounts/'),
  getAccount: (id: string) => api.get<CloudAccount>(`/cloud/accounts/${id}`),
  createAccount: (params: { name: string; provider: string; config: Record<string, unknown> }) =>
    api.post<CloudAccount>('/cloud/accounts/', params),
  updateAccount: (id: string, params: { name?: string; config?: Record<string, unknown>; status?: string }) =>
    api.put<CloudAccount>(`/cloud/accounts/${id}`, params),
  deleteAccount: (id: string) => api.delete<{ ok: true; id: string }>(`/cloud/accounts/${id}`),
  /** 测试云账号连通性 */
  testAccount: (id: string) => api.post<TestConnectionResult>(`/cloud/accounts/${id}/test`, {}),
  /** 获取实例指标 */
  getMetrics: (id: string, params?: { metric?: string; start?: string; end?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.metric) query.set('metric', params.metric);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get(`/cloud/instances/${id}/metrics${qs ? '?' + qs : ''}`);
  },
};
