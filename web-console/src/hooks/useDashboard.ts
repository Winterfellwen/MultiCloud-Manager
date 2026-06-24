import { useQuery } from '@tanstack/react-query';
import { cloudApi } from '../api/cloud';
import { monitorApi } from '../api/monitor';
import { useDemoStore } from '../stores/demo';
import { demoDashboardStats } from '../lib/demo/demo-api';

export interface DashboardStats {
  totalInstances: number;
  runningInstances: number;
  alertCount: number;
  monthlyCost: number;
  byProvider: Record<string, number>;
  errors: { instances: boolean; alerts: boolean; costs: boolean };
}

export function useDashboardStats() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return demoDashboardStats() as unknown as DashboardStats;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const [instances, firingAlerts, costSummary] = await Promise.allSettled([
        cloudApi.listInstances({ limit: 1000 }),
        monitorApi.listEvents({ status: 'firing', limit: 1000 }),
        monitorApi.getCostSummary({ start: monthStart.toISOString(), end: monthEnd.toISOString() }),
      ]);
      const instanceList = instances.status === 'fulfilled' ? instances.value : [];
      const alerts = firingAlerts.status === 'fulfilled' ? firingAlerts.value : [];
      const costs = costSummary.status === 'fulfilled' ? costSummary.value : [];
      const byProvider: Record<string, number> = {};
      for (const inst of instanceList) byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
      return {
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
