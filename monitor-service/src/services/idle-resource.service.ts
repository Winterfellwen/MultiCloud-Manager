import { db } from '../db/index.js';
import { scopedDb, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

interface IdleResource {
  id: string;
  name: string;
  provider: string;
  resourceType: string;
  region: string;
  status: string;
  monthlyCost: number;
  currency: string;
  reason: string;
  daysIdle: number;
  suggestion: string;
}

export class IdleResourceService {
  async detect(scope: RequestScope): Promise<IdleResource[]> {
    const t = scopedDb(scope);
    const results: IdleResource[] = [];

    // 1. Stopped instances with cost > 0 (still paying for storage/IPs)
    const stoppedInstances = await db
      .select()
      .from(t.instances)
      .where(eq(t.instances.status, 'stopped'));

    for (const inst of stoppedInstances) {
      const cost = parseFloat(inst.monthlyCost || '0');
      if (cost > 0) {
        results.push({
          id: inst.id,
          name: inst.name || inst.id.slice(0, 8),
          provider: inst.provider,
          resourceType: 'instance',
          region: inst.region,
          status: 'stopped',
          monthlyCost: cost,
          currency: 'USD',
          reason: '实例已停止但仍产生费用（存储/弹性IP等）',
          daysIdle: 30,
          suggestion: '考虑释放弹性IP和未挂载的云盘，或彻底删除实例',
        });
      }
    }

    // 2. Underutilized instances (avg CPU < 5% over last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const lowCpuInstances = await db
      .select({
        instanceId: t.metrics.instanceId,
        avgCpu: sql<number>`avg(${t.metrics.value}::numeric)`,
      })
      .from(t.metrics)
      .where(and(
        eq(t.metrics.metricName, 'cpu_usage_percent'),
        gte(t.metrics.recordedAt, sevenDaysAgo),
      ))
      .groupBy(t.metrics.instanceId)
      .having(sql`avg(${t.metrics.value}::numeric) < 5`);

    for (const row of lowCpuInstances) {
      if (!row.instanceId) continue;
      if (results.some(r => r.id === row.instanceId)) continue;

      const instResult = await db.select().from(t.instances)
        .where(eq(t.instances.id, row.instanceId))
        .limit(1);
      const inst = instResult[0];
      if (!inst) continue;

      const cost = parseFloat(inst.monthlyCost || '0');
      results.push({
        id: inst.id,
        name: inst.name || inst.id.slice(0, 8),
        provider: inst.provider,
        resourceType: 'instance',
        region: inst.region,
        status: inst.status,
        monthlyCost: cost,
        currency: 'USD',
        reason: `CPU平均使用率 ${Number(row.avgCpu).toFixed(1)}% < 5%，持续低负载`,
        daysIdle: 7,
        suggestion: '考虑降配实例规格或使用竞价实例降低成本',
      });
    }

    return results;
  }

  async calculateSavings(scope: RequestScope): Promise<{
    totalMonthlySavings: number;
    items: IdleResource[];
  }> {
    const idle = await this.detect(scope);
    const total = idle.reduce((sum, r) => sum + r.monthlyCost, 0);
    return {
      totalMonthlySavings: Math.round(total * 0.5 * 100) / 100,
      items: idle,
    };
  }
}

export const idleResourceService = new IdleResourceService();
