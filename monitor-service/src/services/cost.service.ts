import { db } from '../db/index.js';
import { costRecords, instances } from '../db/schema.js';
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
    this.timer = setInterval(() => this.collect().catch(console.error), intervalMs);
    console.log(`Cost collector started (interval: ${config.costCollectIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 从 cloud-service 拉取各 provider 的成本汇总，写入 cost_records
   */
  async collect() {
    const providers = await this.getRegisteredProviders();
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 最近 24 小时

    for (const provider of providers) {
      try {
        const summary = await this.fetchCostFromCloud(provider, start, end);
        for (const item of summary.breakdown) {
          await db.insert(costRecords).values({
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
  async getSummary(query: CostQuery) {
    const conditions = [];
    if (query.provider) conditions.push(eq(costRecords.provider, query.provider));
    if (query.start) conditions.push(gte(costRecords.periodStart, query.start));
    if (query.end) conditions.push(lte(costRecords.periodEnd, query.end));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        provider: costRecords.provider,
        service: costRecords.service,
        totalAmount: sql<number>`sum(${costRecords.amount}::numeric)`,
        currency: costRecords.currency,
      })
      .from(costRecords)
      .where(where)
      .groupBy(costRecords.provider, costRecords.service, costRecords.currency);

    return rows;
  }

  /**
   * 查询所有实例的月度成本估算（从 instances.monthlyCost 汇总）
   */
  async getInstanceCosts() {
    return db
      .select({
        id: instances.id,
        name: instances.name,
        provider: instances.provider,
        region: instances.region,
        monthlyCost: instances.monthlyCost,
      })
      .from(instances);
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
