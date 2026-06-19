import { api } from './client';
import type {
  InstanceRow, CreateInstanceParams, Instance, InstanceActionResponse,
  ListInstancesParams, ProviderRegion, ProviderImage, ProviderInstanceType,
  CloudAccount, SyncResult,
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
  startInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/start`),
  stopInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/stop`),
  rebootInstance: (id: string) => api.post<InstanceActionResponse>(`/cloud/instances/${id}/reboot`),
  deleteInstance: (id: string) => api.delete<{ ok: true; id: string }>(`/cloud/instances/${id}`),
  syncInstances: (provider?: string) =>
    api.post<SyncResult[]>(`/cloud/instances/sync${provider ? '?provider=' + provider : ''}`),
  getProviders: () => api.get<{ providers: string[] }>('/cloud/providers/'),
  getRegions: (provider: string) => api.get<ProviderRegion[]>(`/cloud/providers/${provider}/regions`),
  getImages: (provider: string) => api.get<ProviderImage[]>(`/cloud/providers/${provider}/images`),
  getInstanceTypes: (provider: string, region: string) =>
    api.get<ProviderInstanceType[]>(`/cloud/providers/${provider}/instance-types/${region}`),
  listAccounts: () => api.get<CloudAccount[]>('/cloud/accounts/'),
  createAccount: (params: { name: string; provider: string; config: Record<string, unknown> }) =>
    api.post<CloudAccount>('/cloud/accounts/', params),
  deleteAccount: (id: string) => api.delete<{ ok: true; id: string }>(`/cloud/accounts/${id}`),
};
