import { db } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import type { CreateAuditLogInput, AuditLogQuery, AuditLog } from '@cloudops/shared';

export class AuditService {
  async log(input: CreateAuditLogInput): Promise<void> {
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      provider: input.provider,
      region: input.region,
      params: input.params,
      result: input.result,
      ip: input.ip,
      traceId: input.traceId,
    });
  }

  async query(filters: AuditLogQuery): Promise<AuditLog[]> {
    const conditions = [];
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.provider) conditions.push(eq(auditLogs.provider, filters.provider));
    if (filters.startDate) conditions.push(gte(auditLogs.timestamp, filters.startDate));
    if (filters.endDate) conditions.push(lte(auditLogs.timestamp, filters.endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db.select().from(auditLogs)
      .where(whereClause)
      .orderBy(sql`${auditLogs.timestamp} DESC`)
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    return result as AuditLog[];
  }
}

export const auditService = new AuditService();