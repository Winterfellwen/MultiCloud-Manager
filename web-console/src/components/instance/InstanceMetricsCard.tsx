import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getDemoMetrics } from '@/lib/demo/mock-data';
import { useQuery } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import { Activity, Loader2 } from 'lucide-react';

interface Props {
  instanceId: string;
}

const CHARTS = [
  { key: 'cpu', label: 'CPU', unit: '%', color: '#3b82f6', gradient: ['#93c5fd', '#3b82f6'] },
  { key: 'memory', label: 'Memory', unit: 'MB', color: '#8b5cf6', gradient: ['#c4b5fd', '#8b5cf6'] },
  { key: 'network', label: 'Network', unit: 'KB/s', color: '#10b981', gradient: ['#6ee7b7', '#10b981'] },
  { key: 'disk', label: 'Disk', unit: 'MB/s', color: '#f59e0b', gradient: ['#fcd34d', '#f59e0b'] },
];

export function InstanceMetricsCard({ instanceId }: Props) {
  const { data: realMetrics, isLoading } = useQuery({
    queryKey: ['instance-metrics', instanceId],
    queryFn: () => cloudApi.getMetrics(instanceId, { limit: 24 }),
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (realMetrics && Array.isArray(realMetrics) && realMetrics.length > 0) {
      const cpuData = realMetrics.filter((m: any) => m.metricName === 'cpu_usage' || m.metricName === 'cpu');
      const memData = realMetrics.filter((m: any) => m.metricName === 'memory_usage' || m.metricName === 'memory');
      const netData = realMetrics.filter((m: any) => m.metricName === 'network_in' || m.metricName === 'network');
      const diskData = realMetrics.filter((m: any) => m.metricName === 'disk_read' || m.metricName === 'disk');

      const toChart = (data: any[]) => data.map((p, i) => ({
        time: i,
        value: typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0,
      }));

      return {
        cpu: toChart(cpuData.length > 0 ? cpuData : getDemoMetrics(instanceId, 24)),
        memory: toChart(memData.length > 0 ? memData : getDemoMetrics(instanceId, 24).map(p => ({ ...p, value: p.value * 0.7 + 10 }))),
        network: toChart(netData.length > 0 ? netData : getDemoMetrics(instanceId, 24).map(p => ({ value: Math.max(0, p.value - 30) }))),
        disk: toChart(diskData.length > 0 ? diskData : getDemoMetrics(instanceId, 24).map(p => ({ value: Math.max(0, p.value * 0.4) }))),
      };
    }
    const raw = getDemoMetrics(instanceId, 24);
    return {
      cpu: raw.map((p, i) => ({ time: i, value: p.value })),
      memory: raw.map((p, i) => ({ time: i, value: p.value * 0.7 + 10 })),
      network: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value - 30 + Math.sin(i) * 20) })),
      disk: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value * 0.4 + Math.cos(i) * 10) })),
    };
  }, [instanceId, realMetrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Metrics (24h)
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {CHARTS.map((chart) => (
            <div key={chart.key} className="border rounded-xl p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">{chart.label}</div>
              <ResponsiveContainer width="100%" height={80}>
                {chart.key === 'network' ? (
                  <LineChart data={metrics[chart.key as keyof typeof metrics]}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${chart.unit}`, chart.label]}
                    />
                    <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={1.5} dot={false} />
                  </LineChart>
                ) : (
                  <AreaChart data={metrics[chart.key as keyof typeof metrics]}>
                    <defs>
                      <linearGradient id={`inst-grad-${instanceId}-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chart.gradient[0]} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={chart.gradient[1]} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${chart.unit}`, chart.label]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={chart.color}
                      strokeWidth={1.5}
                      fill={`url(#inst-grad-${instanceId}-${chart.key})`}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
