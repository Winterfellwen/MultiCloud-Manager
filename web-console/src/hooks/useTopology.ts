import { useQuery } from '@tanstack/react-query';
import { topologyApi } from '@/api/topology';
import { useDemoStore } from '@/stores/demo';
import { demoGetTopology } from '@/lib/demo/demo-api';
import type { TopologyData, TopologyFilters } from '@/types/topology';

export function useTopology(filters?: TopologyFilters) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<TopologyData>({
    queryKey: ['topology', filters, isDemoMode],
    queryFn: () => (isDemoMode ? demoGetTopology(filters) : topologyApi.get(filters)),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
