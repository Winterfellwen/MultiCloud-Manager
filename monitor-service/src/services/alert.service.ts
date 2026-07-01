import { db } from '../db/index.js';
import { alertRules, alerts } from '../db/schema.js';
import { eq, and, desc, ne } from 'drizzle-orm';
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

  async listRules() {
    return db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
  }

  async getRule(id: string) {
    const result = await db.select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
    if (result.length === 0) throw new NotFoundError('AlertRule', id);
    return result[0];
  }

  async createRule(input: CreateRuleInput) {
    const result = await db
      .insert(alertRules)
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

  async updateRule(id: string, input: Partial<CreateRuleInput>) {
    await this.getRule(id);
    const result = await db
      .update(alertRules)
      .set(input)
      .where(eq(alertRules.id, id))
      .returning();
    return result[0];
  }

  async deleteRule(id: string) {
    await this.getRule(id);
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  // ---- 告警事件管理 ----

  async listAlerts(filters: { status?: AlertStatus; severity?: AlertSeverity; limit?: number } = {}) {
    const conditions = [];
    if (filters.status) conditions.push(eq(alerts.status, filters.status));
    if (filters.severity) conditions.push(eq(alerts.severity, filters.severity));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    return db.select().from(alerts).where(where).orderBy(desc(alerts.firedAt)).limit(limit);
  }

  async createAlert(input: {
    ruleId: string;
    instanceId: string | null;
    severity: AlertSeverity;
    message: string;
  }) {
    const result = await db
      .insert(alerts)
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

  async resolveAlert(id: string) {
    await db
      .update(alerts)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(alerts.id, id));
  }

  /**
   * 查询某规则某实例是否已有 firing 状态的告警（避免重复触发）
   */
  async findFiringAlert(ruleId: string, instanceId: string | null) {
    const conditions = [eq(alerts.ruleId, ruleId), eq(alerts.status, 'firing')];
    if (instanceId) {
      conditions.push(eq(alerts.instanceId, instanceId));
    }
    const result = await db.select().from(alerts).where(and(...conditions)).limit(1);
    return result[0] || null;
  }

  async updateAiAnalysis(id: string, analysis: string): Promise<void> {
    await db
      .update(alerts)
      .set({ aiAnalysis: analysis, aiAnalyzedAt: new Date() })
      .where(eq(alerts.id, id));
  }
}

export const alertService = new AlertService();
