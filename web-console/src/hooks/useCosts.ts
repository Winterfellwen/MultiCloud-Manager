import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import { useDemoStore } from '@/stores/demo';
import { demoGetCostSummary } from '@/lib/demo/demo-api';
import type { CostSummaryParams, CostSummaryItem } from '@/types/monitor';

export function useCostSummary(params?: CostSummaryParams) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<CostSummaryItem[]>({
    queryKey: ['cost-summary', params, isDemoMode],
    queryFn: async () => {
      if (isDemoMode && params?.start && params?.end) {
        const demos = await demoGetCostSummary(params.start, params.end);
        // 转换 demo 成本数据为 CostSummaryItem 格式
        const items: CostSummaryItem[] = [];
        for (const d of demos) {
          for (const b of d.breakdown) {
            items.push({
              provider: d.provider,
              service: b.service,
              totalAmount: b.amount,
              currency: d.currency,
            });
          }
        }
        return items;
      }
      return monitorApi.getCostSummary(params);
    },
  });
}

export function useInstanceCosts() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['instance-costs', isDemoMode],
    queryFn: () => isDemoMode ? Promise.resolve([]) : monitorApi.getInstanceCosts(),
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
