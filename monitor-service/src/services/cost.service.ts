import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { eventPublisher } from '../events/publisher.js';

interface CostQuery {
  provider?: string;
  start?: Date;
  end?: Date;
}

interface CostSummaryResponse {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  breakdown: { service: string; amount: number }[];
}

export class CostService {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.costCollectIntervalSec * 1000;
    this.timer = setInterval(() => this.collect(PUBLIC_SCOPE).catch(console.error), intervalMs);
    console.log(`Cost collector started (interval: ${config.costCollectIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 从 cloud-service 拉取各 provider 的成本汇总，写入 cost_records
   */
  async collect(scope: RequestScope) {
    const t = scopedDb(scope);
    const providers = await this.getRegisteredProviders();
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 最近 24 小时

    for (const provider of providers) {
      try {
        const summary = await this.fetchCostFromCloud(provider, start, end);
        for (const item of summary.breakdown) {
          await db.insert(t.costRecords).values({
            provider: summary.provider,
            region: 'all',
            service: item.service,
            amount: item.amount.toString(),
            currency: summary.currency,
            periodStart: start,
            periodEnd: end,
          });
        }
        await eventPublisher.publish('cost.updated', {
          provider: summary.provider,
          totalAmount: summary.totalAmount,
          currency: summary.currency,
        });
      } catch (err) {
        console.error(`Cost collection for ${provider} failed:`, (err as Error).message);
      }
    }
  }

  /**
   * 查询成本汇总（从 cost_records 聚合）
   */
  async getSummary(scope: RequestScope, query: CostQuery) {
    const t = scopedDb(scope);
    const conditions = [];
    if (query.provider) conditions.push(eq(t.costRecords.provider, query.provider));
    if (query.start) conditions.push(gte(t.costRecords.periodStart, query.start));
    if (query.end) conditions.push(lte(t.costRecords.periodEnd, query.end));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        provider: t.costRecords.provider,
        service: t.costRecords.service,
        totalAmount: sql<number>`sum(${t.costRecords.amount}::numeric)`,
        currency: t.costRecords.currency,
      })
      .from(t.costRecords)
      .where(where)
      .groupBy(t.costRecords.provider, t.costRecords.service, t.costRecords.currency);

    return rows;
  }

  /**
   * 查询所有实例的月度成本估算（从 instances.monthlyCost 汇总）
   */
  async getInstanceCosts(scope: RequestScope) {
    const t = scopedDb(scope);
    return db
      .select({
        id: t.instances.id,
        name: t.instances.name,
        provider: t.instances.provider,
        region: t.instances.region,
        monthlyCost: t.instances.monthlyCost,
      })
      .from(t.instances);
  }

  private async getRegisteredProviders(): Promise<string[]> {
    const res = await fetch(`${config.cloudServiceUrl}/cloud/providers`);
    if (!res.ok) throw new Error(`cloud-service responded ${res.status}`);
    const data = (await res.json()) as { providers: string[] };
    return data.providers;
  }

  private async fetchCostFromCloud(
    provider: string,
    start: Date,
    end: Date
  ): Promise<CostSummaryResponse> {
    // cloud-service 暂无 cost 端点，这里通过 provider 直接调用的替代方案：
    // 实际调用 cloud-service 的内部接口。MVP 阶段先返回占位数据。
    // Phase 6 会完善 cloud-service 的 cost 端点。
    return {
      provider,
      totalAmount: 0,
      currency: provider === 'aliyun' ? 'CNY' : 'USD',
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      breakdown: [],
    };
  }
}

export const costService = new CostService();
