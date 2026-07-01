import { useQuery } from '@tanstack/react-query';
import { cloudApi } from '../api/cloud';
import { resourceApi } from '../api/resource';
import { monitorApi } from '../api/monitor';

export interface DashboardStats {
  totalResources: number;
  totalInstances: number;
  runningInstances: number;
  alertCount: number;
  monthlyCost: number;
  byProvider: Record<string, number>;
  errors: { instances: boolean; alerts: boolean; costs: boolean };
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const [instances, firingAlerts, costSummary, resourceStats] = await Promise.allSettled([
        cloudApi.listInstances({ limit: 1000 }),
        monitorApi.listEvents({ status: 'firing', limit: 1000 }),
        monitorApi.getCostSummary({ start: monthStart.toISOString(), end: monthEnd.toISOString() }),
        resourceApi.getStats(),
      ]);
      const instanceList = instances.status === 'fulfilled' ? instances.value : [];
      const alerts = firingAlerts.status === 'fulfilled' ? firingAlerts.value : [];
      const costs = costSummary.status === 'fulfilled' ? costSummary.value : [];
      const rStats = resourceStats.status === 'fulfilled' ? resourceStats.value : null;
      const totalResources = rStats
        ? rStats.byType.reduce((sum, item) => sum + item.count, 0)
        : instanceList.length;
      const byProvider: Record<string, number> = {};
      if (rStats) {
        for (const item of rStats.byType) {
          byProvider[item.provider] = (byProvider[item.provider] || 0) + item.count;
        }
      } else {
        for (const inst of instanceList) byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
      }
      return {
        totalResources,
        totalInstances: instanceList.length,
        runningInstances: instanceList.filter((i) => i.status === 'running').length,
        alertCount: alerts.length,
        monthlyCost: costs.reduce((sum, c) => sum + (Number(c.totalAmount) || 0), 0),
        byProvider,
        errors: { instances: instances.status === 'rejected', alerts: firingAlerts.status === 'rejected', costs: costSummary.status === 'rejected' },
      };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
