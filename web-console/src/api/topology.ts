import { api } from './client';
import type { TopologyData, TopologyFilters } from '@/types/topology';

export const topologyApi = {
  get: (filters?: TopologyFilters) => {
    const params = new URLSearchParams();
    if (filters?.provider) params.set('provider', filters.provider);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.resourceType) params.set('resourceType', filters.resourceType);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.cloudAccountId) params.set('cloudAccountId', filters.cloudAccountId);
    const query = params.toString();
    return api.get<TopologyData>(`/topology${query ? `?${query}` : ''}`);
  },
};
