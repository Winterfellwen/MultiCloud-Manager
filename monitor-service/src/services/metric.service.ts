import { db } from '../db/index.js';
import { scopedDb, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';

export interface MetricQuery {
  instanceId: string;
  metricName?: string;
  start?: Date;
  end?: Date;
  limit?: number;
}

export class MetricService {
  async query(scope: RequestScope, query: MetricQuery) {
    const t = scopedDb(scope);
    const conditions = [eq(t.metrics.instanceId, query.instanceId)];
    if (query.metricName) conditions.push(eq(t.metrics.metricName, query.metricName));
    if (query.start) conditions.push(gte(t.metrics.recordedAt, query.start));
    if (query.end) conditions.push(lte(t.metrics.recordedAt, query.end));

    const limit = query.limit || 1000;
    return db
      .select()
      .from(t.metrics)
      .where(and(...conditions))
      .orderBy(desc(t.metrics.recordedAt))
      .limit(limit);
  }

  async insert(scope: RequestScope, data: {
    instanceId: string;
    metricName: string;
    value: number;
    unit?: string;
    recordedAt: Date;
  }) {
    const t = scopedDb(scope);
    await db.insert(t.metrics).values({
      instanceId: data.instanceId,
      metricName: data.metricName,
      value: data.value.toString(),
      unit: data.unit,
      recordedAt: data.recordedAt,
    });
  }
}

export const metricService = new MetricService();
