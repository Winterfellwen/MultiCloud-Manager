import { db } from '../db/index.js';
import { scopedDb, type RequestScope } from '@cloudops/shared';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';
import type { AlertSeverity, AlertStatus } from '@cloudops/shared';

export interface CreateRuleInput {
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: { type: string; targets: string[] }[];
  enabled?: boolean;
}

export class AlertService {
  // ---- 告警规则 CRUD ----

  async listRules(scope: RequestScope) {
    const t = scopedDb(scope);
    return db.select().from(t.alertRules).orderBy(desc(t.alertRules.createdAt));
  }

  async getRule(scope: RequestScope, id: string) {
    const t = scopedDb(scope);
    const result = await db.select().from(t.alertRules).where(eq(t.alertRules.id, id)).limit(1);
    if (result.length === 0) throw new NotFoundError('AlertRule', id);
    return result[0];
  }

  async createRule(scope: RequestScope, input: CreateRuleInput) {
    const t = scopedDb(scope);
    const result = await db
      .insert(t.alertRules)
      .values({
        name: input.name,
        metric: input.metric,
        condition: input.condition,
        duration: input.duration,
        severity: input.severity,
        actions: input.actions,
        enabled: input.enabled ?? true,
      })
      .returning();
    return result[0];
  }

  async updateRule(scope: RequestScope, id: string, input: Partial<CreateRuleInput>) {
    await this.getRule(scope, id);
    const t = scopedDb(scope);
    const result = await db
      .update(t.alertRules)
      .set(input)
      .where(eq(t.alertRules.id, id))
      .returning();
    return result[0];
  }

  async deleteRule(scope: RequestScope, id: string) {
    await this.getRule(scope, id);
    const t = scopedDb(scope);
    await db.delete(t.alertRules).where(eq(t.alertRules.id, id));
  }

  // ---- 告警事件管理 ----

  async listAlerts(scope: RequestScope, filters: { status?: AlertStatus; severity?: AlertSeverity; limit?: number } = {}) {
    const t = scopedDb(scope);
    const conditions = [];
    if (filters.status) conditions.push(eq(t.alerts.status, filters.status));
    if (filters.severity) conditions.push(eq(t.alerts.severity, filters.severity));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    return db.select().from(t.alerts).where(where).orderBy(desc(t.alerts.firedAt)).limit(limit);
  }

  async createAlert(scope: RequestScope, input: {
    ruleId: string;
    instanceId: string | null;
    severity: AlertSeverity;
    message: string;
  }) {
    const t = scopedDb(scope);
    const result = await db
      .insert(t.alerts)
      .values({
        ruleId: input.ruleId,
        instanceId: input.instanceId,
        severity: input.severity,
        message: input.message,
        status: 'firing',
      })
      .returning();
    return result[0];
  }

  async resolveAlert(scope: RequestScope, id: string) {
    const t = scopedDb(scope);
    await db
      .update(t.alerts)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(t.alerts.id, id));
  }

  /**
   * 查询某规则某实例是否已有 firing 状态的告警（避免重复触发）
   */
  async findFiringAlert(scope: RequestScope, ruleId: string, instanceId: string | null) {
    const t = scopedDb(scope);
    const conditions = [eq(t.alerts.ruleId, ruleId), eq(t.alerts.status, 'firing')];
    if (instanceId) {
      conditions.push(eq(t.alerts.instanceId, instanceId));
    }
    const result = await db.select().from(t.alerts).where(and(...conditions)).limit(1);
    return result[0] || null;
  }

  async updateAiAnalysis(scope: RequestScope, id: string, analysis: string): Promise<void> {
    const t = scopedDb(scope);
    await db
      .update(t.alerts)
      .set({ aiAnalysis: analysis, aiAnalyzedAt: new Date() })
      .where(eq(t.alerts.id, id));
  }
}

export const alertService = new AlertService();
