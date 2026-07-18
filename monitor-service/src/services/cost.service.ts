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

  async getForecast(scope: RequestScope, options: { provider?: string; months?: number }) {
    const t = scopedDb(scope);
    const months = options.months || 3;
    const now = new Date();
    const historicalStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const conditions = [gte(t.costRecords.periodStart, historicalStart)];
    if (options.provider) conditions.push(eq(t.costRecords.provider, options.provider));

    const rows = await db
      .select({
        periodStart: t.costRecords.periodStart,
        provider: t.costRecords.provider,
        totalAmount: sql<number>`sum(${t.costRecords.amount}::numeric)`,
        currency: t.costRecords.currency,
      })
      .from(t.costRecords)
      .where(and(...conditions))
      .groupBy(t.costRecords.periodStart, t.costRecords.provider, t.costRecords.currency)
      .orderBy(t.costRecords.periodStart);

    const monthlyMap = new Map<string, { total: number; currency: string }>();
    for (const row of rows) {
      const monthKey = new Date(row.periodStart).toISOString().slice(0, 7);
      const existing = monthlyMap.get(monthKey) || { total: 0, currency: row.currency };
      existing.total += Number(row.totalAmount) || 0;
      monthlyMap.set(monthKey, existing);
    }

    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { total, currency }]) => ({
        month,
        total: Math.round(total * 100) / 100,
        currency,
      }));

    const values = monthlyData.map(d => d.total);
    const n = values.length;
    if (n < 2) {
      return {
        historical: monthlyData,
        forecast: [],
        trend: 'insufficient_data' as const,
      };
    }

    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) * (i - xMean);
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    const forecast = [];
    const lastMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : now.toISOString().slice(0, 7);
    const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);

    for (let i = 1; i <= months; i++) {
      const fi = n - 1 + i;
      const predicted = Math.max(0, intercept + slope * fi);
      const m = lastMonthNum + i;
      const forecastMonth = `${lastYear + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`;
      forecast.push({
        month: forecastMonth,
        predicted: Math.round(predicted * 100) / 100,
        currency: monthlyData[0]?.currency || 'USD',
      });
    }

    const trend = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';

    return { historical: monthlyData, forecast, trend };
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
