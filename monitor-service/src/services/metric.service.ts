import { db } from '../db/index.js';
import { metrics } from '../db/schema.js';
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
  async query(query: MetricQuery) {
    const conditions = [eq(metrics.instanceId, query.instanceId)];
    if (query.metricName) conditions.push(eq(metrics.metricName, query.metricName));
    if (query.start) conditions.push(gte(metrics.recordedAt, query.start));
    if (query.end) conditions.push(lte(metrics.recordedAt, query.end));

    const limit = query.limit || 1000;
    return db
      .select()
      .from(metrics)
      .where(and(...conditions))
      .orderBy(desc(metrics.recordedAt))
      .limit(limit);
  }

  async insert(data: {
    instanceId: string;
    metricName: string;
    value: number;
    unit?: string;
    recordedAt: Date;
  }) {
    await db.insert(metrics).values({
      instanceId: data.instanceId,
      metricName: data.metricName,
      value: data.value.toString(),
      unit: data.unit,
      recordedAt: data.recordedAt,
    });
  }
}

export const metricService = new MetricService();
