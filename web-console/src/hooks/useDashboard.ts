// Dashboard 聚合数据 hooks（后端无专门聚合接口，前端并行调用 cloud/monitor）
import { useQuery } from '@tanstack/react-query';
import { cloudApi } from '../api/cloud';
import { monitorApi } from '../api/monitor';

export interface DashboardStats {
  totalInstances: number;
  runningInstances: number;
  alertCount: number;
  monthlyCost: number;
  byProvider: Record<string, number>;
  errors: {
    instances: boolean;
    alerts: boolean;
    costs: boolean;
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const [instances, firingAlerts, costSummary] = await Promise.allSettled([
        cloudApi.listInstances({ limit: 1000 }),
        monitorApi.listEvents({ status: 'firing', limit: 1000 }),
        monitorApi.getCostSummary({
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        }),
      ]);

      const instanceList = instances.status === 'fulfilled' ? instances.value : [];
      const alerts = firingAlerts.status === 'fulfilled' ? firingAlerts.value : [];
      const costs = costSummary.status === 'fulfilled' ? costSummary.value : [];

      const totalInstances = instanceList.length;
      const runningInstances = instanceList.filter((i) => i.status === 'running').length;
      const alertCount = alerts.length;
      const monthlyCost = costs.reduce((sum, c) => sum + (Number(c.totalAmount) || 0), 0);

      // 按云厂商分组
      const byProvider: Record<string, number> = {};
      for (const inst of instanceList) {
        byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
      }

      return {
        totalInstances,
        runningInstances,
        alertCount,
        monthlyCost,
        byProvider,
        errors: {
          instances: instances.status === 'rejected',
          alerts: firingAlerts.status === 'rejected',
          costs: costSummary.status === 'rejected',
        },
      };
    },
    staleTime: 60_000,
  });
}
