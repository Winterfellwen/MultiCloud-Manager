import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CostSummaryParams } from '@/types/monitor';

export function useCostSummary(params?: CostSummaryParams) {
  return useQuery({ queryKey: ['cost-summary', params], queryFn: () => monitorApi.getCostSummary(params) });
}

export function useInstanceCosts() {
  return useQuery({ queryKey: ['instance-costs'], queryFn: () => monitorApi.getInstanceCosts() });
}

export function useCollectCosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi.collectCosts(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-summary'] });
      qc.invalidateQueries({ queryKey: ['instance-costs'] });
    },
  });
}
