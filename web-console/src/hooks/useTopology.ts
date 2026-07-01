import { useQuery } from '@tanstack/react-query';
import { topologyApi } from '@/api/topology';
import type { TopologyData, TopologyFilters } from '@/types/topology';

export function useTopology(filters?: TopologyFilters) {
  return useQuery<TopologyData>({
    queryKey: ['topology', filters],
    queryFn: () => topologyApi.get(filters),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
