import { db } from '../db/index.js';
import type { RequestScope } from '@cloudops/shared';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { silenceWindows } from '../db/schema.js';

export interface CreateSilenceInput {
  name: string;
  ruleIds?: string[];
  instanceIds?: string[];
  matchExpression?: Record<string, unknown>;
  startTime: Date;
  endTime: Date;
  reason?: string;
  createdBy?: string;
}

export class SilenceService {

  async list(_scope: RequestScope) {
    return db.select().from(silenceWindows).orderBy(desc(silenceWindows.createdAt));
  }

  async getById(_scope: RequestScope, id: string) {
    const result = await db.select().from(silenceWindows).where(eq(silenceWindows.id, id)).limit(1);
    return result[0] || null;
  }

  async create(_scope: RequestScope, input: CreateSilenceInput) {
    const result = await db
      .insert(silenceWindows)
      .values({
        name: input.name,
        ruleIds: JSON.stringify(input.ruleIds || []),
        instanceIds: JSON.stringify(input.instanceIds || []),
        matchExpression: input.matchExpression ? JSON.stringify(input.matchExpression) : null,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason || null,
        createdBy: input.createdBy || null,
      })
      .returning();
    return result[0];
  }

  async update(_scope: RequestScope, id: string, input: Partial<CreateSilenceInput>) {
    const values: any = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.ruleIds !== undefined) values.ruleIds = JSON.stringify(input.ruleIds);
    if (input.instanceIds !== undefined) values.instanceIds = JSON.stringify(input.instanceIds);
    if (input.matchExpression !== undefined) values.matchExpression = JSON.stringify(input.matchExpression);
    if (input.startTime !== undefined) values.startTime = input.startTime;
    if (input.endTime !== undefined) values.endTime = input.endTime;
    if (input.reason !== undefined) values.reason = input.reason;
    const result = await db
      .update(silenceWindows)
      .set(values)
      .where(eq(silenceWindows.id, id))
      .returning();
    return result[0];
  }

  async delete(_scope: RequestScope, id: string) {
    await db.delete(silenceWindows).where(eq(silenceWindows.id, id));
  }

  async getActiveWindows(_scope: RequestScope, ruleId?: string, instanceId?: string) {
    const now = new Date();
    const conditions = [
      lte(silenceWindows.startTime, now),
      gte(silenceWindows.endTime, now),
    ];
    let rows = await db.select().from(silenceWindows).where(and(...conditions));

    // Filter by ruleId and instanceId if provided
    if (ruleId || instanceId) {
      rows = rows.filter(w => {
        const ruleIds = (w.ruleIds as string[]) || [];
        const instanceIds = (w.instanceIds as string[]) || [];
        const matchRule = ruleIds.length === 0 || ruleIds.includes(ruleId || '');
        const matchInstance = instanceIds.length === 0 || instanceIds.includes(instanceId || '');
        return matchRule && matchInstance;
      });
    }

    return rows;
  }

  async isSilenced(scope: RequestScope, ruleId: string, instanceId?: string): Promise<boolean> {
    const windows = await this.getActiveWindows(scope, ruleId, instanceId);
    return windows.length > 0;
  }
}

export const silenceService = new SilenceService();
