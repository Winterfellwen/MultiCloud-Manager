import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE } from '@cloudops/shared';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { metricService } from '../services/metric.service.js';

interface CloudInstance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string | null;
  status: string;
  region: string;
}

interface MetricPoint {
  timestamp: Date | string;
  value: number;
  unit?: string;
}

export class MetricCollector {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.metricCollectIntervalSec * 1000;
    this.timer = setInterval(() => this.collect().catch(console.error), intervalMs);
    // 启动后立即采集一次
    this.collect().catch(console.error);
    console.log(`Metric collector started (interval: ${config.metricCollectIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async collect() {
    // 从共享 DB 读取所有 running 实例（定时任务用 PUBLIC_SCOPE，Phase 4 再改为双跑）
    const t = scopedDb(PUBLIC_SCOPE);
    const runningInstances = await db
      .select()
      .from(t.instances)
      .where(eq(t.instances.status, 'running'));

    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);
    let collected = 0;

    const metricNames = ['cpu_usage_percent', 'memory_utilization', 'network_in', 'network_out', 'disk_io'];

    for (const inst of runningInstances) {
      try {
        for (const metricName of metricNames) {
          const points = await this.fetchMetricsFromCloud(inst.id, start, end, metricName);
          for (const point of points) {
            await metricService.insert(PUBLIC_SCOPE, {
              instanceId: inst.id,
              metricName,
              value: point.value,
              unit: point.unit || 'Percent',
              recordedAt: new Date(point.timestamp),
            });
          }
          collected += points.length;
        }
      } catch (err) {
        console.error(`Failed to collect metrics for ${inst.id}:`, (err as Error).message);
      }
    }

    console.log(`Metric collection done: ${collected} points from ${runningInstances.length} instances`);
  }

  private async fetchMetricsFromCloud(
    instanceId: string,
    start: Date,
    end: Date,
    metricName?: string
  ): Promise<MetricPoint[]> {
    let url = `${config.cloudServiceUrl}/cloud/instances/${instanceId}/metrics?start=${start.toISOString()}&end=${end.toISOString()}`;
    if (metricName) url += `&metric=${metricName}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`cloud-service responded ${res.status}`);
    }
    return (await res.json()) as MetricPoint[];
  }
}

export const metricCollector = new MetricCollector();
