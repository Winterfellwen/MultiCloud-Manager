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
      if (isDemoMode) {
        // 在 demo 模式下，如果没有提供 start/end 参数，使用默认的本月时间范围
        const now = new Date();
        const start = params?.start || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const end = params?.end || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const demos = await demoGetCostSummary(start, end);
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
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useMutation({
    mutationFn: () => isDemoMode ? Promise.resolve({ ok: true as const, message: 'Demo mode: costs collected' }) : monitorApi.collectCosts(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-summary'] });
      qc.invalidateQueries({ queryKey: ['instance-costs'] });
    },
  });
}
