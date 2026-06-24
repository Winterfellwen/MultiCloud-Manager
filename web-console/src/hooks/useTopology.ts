import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useDemoStore } from '@/stores/demo';
import { demoGetTopology } from '@/lib/demo/demo-api';
import type { TopologyData, TopologyFilters } from '@/types/topology';

export function useTopology(filters?: TopologyFilters) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<TopologyData>({
    queryKey: ['topology', filters, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return demoGetTopology(filters);
      }

      const params = new URLSearchParams();
      if (filters?.provider) params.set('provider', filters.provider);
      if (filters?.region) params.set('region', filters.region);
      if (filters?.resourceType) params.set('resourceType', filters.resourceType);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.cloudAccountId) params.set('cloudAccountId', filters.cloudAccountId);

      const query = params.toString();
      return api.get<TopologyData>(`/topology${query ? `?${query}` : ''}`);
    },
    staleTime: 30_000,
  });
}
