import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CostSummaryParams, CostSummaryItem, CostForecastResponse } from '@/types/monitor';

export function useCostSummary(params?: CostSummaryParams) {
  return useQuery<CostSummaryItem[]>({
    queryKey: ['cost-summary', params],
    queryFn: () => monitorApi.getCostSummary(params),
  });
}

export function useInstanceCosts() {
  return useQuery({
    queryKey: ['instance-costs'],
    queryFn: () => monitorApi.getInstanceCosts(),
  });
}

export function useCostForecast(provider?: string, months?: number) {
  return useQuery<CostForecastResponse>({
    queryKey: ['cost-forecast', provider, months],
    queryFn: () => monitorApi.getCostForecast({ provider, months }),
    refetchInterval: 5 * 60 * 1000,
  });
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
