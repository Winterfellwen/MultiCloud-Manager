import { queryAll, queryOne } from '../db/client';
import type { AuditLog, CreateAuditLogInput, AuditLogQuery } from '@cloudops/shared';

export interface AuditLogRow {
  id: string;
  timestamp: Date;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  errorMessage: string | null;
}

export class AuditService {
  async log(input: CreateAuditLogInput): Promise<void> {
    const { query } = await import('../db/client');
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, success, ip_address, user_agent, error_message) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.userId,
        input.action,
        input.resourceType,
        input.resourceId,
        JSON.stringify(input.params || {}),
        input.result,
        input.ip,
        input.traceId || null,
        input.result === 'failure' ? 'Operation failed' : null,
      ]
    );
  }

  async query(filters: AuditLogQuery): Promise<AuditLog[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters.provider) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.provider);
    }
    if (filters.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    params.push(limit, offset);

    const rows = await queryAll<AuditLogRow>(
      `SELECT id, timestamp, user_id, action, resource_type, resource_id, details, success, ip_address, user_agent, error_message
       FROM audit_logs
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.userId || '',
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      provider: row.resourceType,
      region: null,
      params: row.details,
      result: row.success ? 'success' : 'failure',
      ip: row.ip,
      traceId: row.userAgent,
    }));
  }

  async getById(id: string): Promise<AuditLog | null> {
    const row = await queryOne<AuditLogRow>(
      `SELECT id, timestamp, user_id, action, resource_type, resource_id, details, success, ip_address, user_agent, error_message
       FROM audit_logs WHERE id = $1`,
      [id]
    );

    if (!row) return null;

    return {
      id: row.id,
      timestamp: row.timestamp,
      userId: row.userId || '',
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      provider: row.resourceType,
      region: null,
      params: row.details,
      result: row.success ? 'success' : 'failure',
      ip: row.ip,
      traceId: row.userAgent,
    };
  }
}

export const auditService = new AuditService();