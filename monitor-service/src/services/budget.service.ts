import { db } from '../db/index.js';
import type { RequestScope } from '@cloudops/shared';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { budgets, costRecords } from '../db/schema.js';

export interface CreateBudgetInput {
  name: string;
  provider: string;
  service?: string;
  amount: number;
  currency?: string;
  period: string;
  startDate: Date;
  endDate: Date;
  notifyThreshold?: number;
  enabled?: boolean;
}

interface BudgetWithSpend {
  id: string;
  name: string;
  provider: string;
  service: string;
  amount: number;
  currency: string;
  period: string;
  startDate: Date;
  endDate: Date;
  notifyThreshold: number;
  enabled: boolean | null;
  createdAt: Date;
  totalSpend: number;
  spendPercentage: number;
}

export class BudgetService {
  async list(_scope: RequestScope) {
    return db.select().from(budgets).orderBy(desc(budgets.createdAt));
  }

  async getById(_scope: RequestScope, id: string) {
    const result = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1);
    return result[0] || null;
  }

  async create(_scope: RequestScope, input: CreateBudgetInput) {
    const result = await db.insert(budgets).values({
      name: input.name,
      provider: input.provider,
      service: input.service || '',
      amount: input.amount.toString(),
      currency: input.currency || 'USD',
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      notifyThreshold: input.notifyThreshold ?? 80,
      enabled: input.enabled ?? true,
    }).returning();
    return result[0];
  }

  async update(_scope: RequestScope, id: string, input: Partial<CreateBudgetInput>) {
    const values: any = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.provider !== undefined) values.provider = input.provider;
    if (input.service !== undefined) values.service = input.service;
    if (input.amount !== undefined) values.amount = input.amount.toString();
    if (input.currency !== undefined) values.currency = input.currency;
    if (input.period !== undefined) values.period = input.period;
    if (input.startDate !== undefined) values.startDate = input.startDate;
    if (input.endDate !== undefined) values.endDate = input.endDate;
    if (input.notifyThreshold !== undefined) values.notifyThreshold = input.notifyThreshold;
    if (input.enabled !== undefined) values.enabled = input.enabled;
    const result = await db.update(budgets).set(values).where(eq(budgets.id, id)).returning();
    return result[0];
  }

  async delete(_scope: RequestScope, id: string) {
    await db.delete(budgets).where(eq(budgets.id, id));
  }

  async getBudgetVsActual(_scope: RequestScope): Promise<BudgetWithSpend[]> {
    const allBudgets = await db.select().from(budgets).where(eq(budgets.enabled, true));

    const result: BudgetWithSpend[] = [];
    for (const b of allBudgets) {
      const spendRows = await db
        .select({
          total: sql<number>`sum(${costRecords.amount}::numeric)`,
        })
        .from(costRecords)
        .where(and(
          eq(costRecords.provider, b.provider),
          gte(costRecords.periodStart, b.startDate),
          lte(costRecords.periodEnd, b.endDate),
          b.service ? eq(costRecords.service, b.service as string) : sql`true`,
        ));

      const totalSpend = parseFloat(spendRows[0]?.total?.toString() || '0');
      const amount = parseFloat(b.amount);
      result.push({
        id: b.id,
        name: b.name,
        provider: b.provider,
        service: (b.service as string) || '',
        amount,
        currency: (b.currency as string) || 'USD',
        period: b.period,
        startDate: b.startDate,
        endDate: b.endDate,
        notifyThreshold: b.notifyThreshold || 80,
        enabled: b.enabled,
        createdAt: b.createdAt,
        totalSpend,
        spendPercentage: amount > 0 ? Math.round((totalSpend / amount) * 10000) / 100 : 0,
      });
    }

    return result;
  }
}

export const budgetService = new BudgetService();
