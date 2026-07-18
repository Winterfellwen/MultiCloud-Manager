import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, desc } from 'drizzle-orm';
import { config } from '../config.js';
import { alertService } from './alert.service.js';
import { notifyService } from './notify.service.js';
import { eventPublisher } from '../events/publisher.js';
import { remediationEngine } from './remediation-engine.js';
import { silenceService } from './silence.service.js';
import type { AlertSeverity } from '@cloudops/shared';

interface RuleRow {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: string;
  actions: unknown;
  enabled: boolean | null;
  conditions?: Array<{ metric: string; condition: string }> | null;
  conditionOperator?: string | null;
}

export class AlertEngine {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.alertCheckIntervalSec * 1000;
    this.timer = setInterval(() => this.checkAll(PUBLIC_SCOPE).catch(console.error), intervalMs);
    console.log(`Alert engine started (interval: ${config.alertCheckIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async checkAll(scope: RequestScope) {
    const t = scopedDb(scope);
    const rules = await db.select().from(t.alertRules).where(eq(t.alertRules.enabled, true));
    for (const rule of rules) {
      await this.evaluateRule(scope, rule as RuleRow).catch((err) =>
        console.error(`Rule ${rule.name} evaluation failed:`, err)
      );
    }
  }

  private async evaluateRule(scope: RequestScope, rule: RuleRow) {
    const t = scopedDb(scope);
    const durationMs = this.parseDuration(rule.duration);
    const since = new Date(Date.now() - durationMs);

    // 复合条件规则
    if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      return this.evaluateCompositeRule(scope, rule, rule.conditions, rule.conditionOperator || 'AND', since);
    }

    // 传统单条件规则
    const points = await db
      .select()
      .from(t.metrics)
      .where(and(eq(t.metrics.metricName, rule.metric), gte(t.metrics.recordedAt, since)))
      .orderBy(desc(t.metrics.recordedAt));

    if (points.length === 0) return;

    const byInstance = new Map<string, typeof points>();
    for (const p of points) {
      if (!p.instanceId) continue;
      const arr = byInstance.get(p.instanceId) || [];
      arr.push(p);
      byInstance.set(p.instanceId, arr);
    }

    for (const [instanceId, instancePoints] of byInstance) {
      const triggered = instancePoints.some((p) => this.evaluateCondition(rule.condition, parseFloat(p.value)));
      const existing = await alertService.findFiringAlert(scope, rule.id, instanceId);

      if (triggered && !existing) {
        // 检查静默窗口
        const silenced = await silenceService.isSilenced(scope, rule.id, instanceId);
        if (silenced) continue;

        const cooldownMinutes = 10;
        const lastResolved = await alertService.findLastResolvedAlert(scope, rule.id, instanceId, cooldownMinutes);
        if (lastResolved) continue;
        const inst = await db.select().from(t.instances).where(eq(t.instances.id, instanceId)).limit(1);
        const instName = inst[0]?.name || instanceId;
        const alert = await alertService.createAlert(scope, {
          ruleId: rule.id,
          instanceId,
          severity: rule.severity as AlertSeverity,
          message: `告警「${rule.name}」：实例 ${instName} 的 ${rule.metric} ${rule.condition}（当前值 ${instancePoints[0].value}）`,
        });
        await notifyService.notify(rule.actions as any, alert.message, rule.severity as AlertSeverity);
        await eventPublisher.publish('alert.fired', { alertId: alert.id, ruleId: rule.id, instanceId, severity: rule.severity });
        this.requestAiAnalysis(scope, alert.id, {
          ruleName: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          currentValue: String(instancePoints[0].value),
          instanceName: instName,
          instanceId,
          severity: rule.severity,
          message: alert.message,
        }).catch((err) => console.error(`AI analysis for alert ${alert.id} failed:`, err));
        remediationEngine.onAlertFired(scope, alert.id, instanceId, rule.metric, String(instancePoints[0].value))
          .catch((err) => console.error(`Remediation for alert ${alert.id} failed:`, err));
      } else if (!triggered && existing) {
        await alertService.resolveAlert(scope, existing.id, 10);
        await eventPublisher.publish('alert.resolved', { alertId: existing.id, ruleId: rule.id, instanceId });
      }
    }
  }

  private async evaluateCompositeRule(
    scope: RequestScope,
    rule: RuleRow,
    conditions: Array<{ metric: string; condition: string }>,
    operator: string,
    since: Date
  ) {
    const t = scopedDb(scope);
    const op = operator === 'OR' ? 'OR' : 'AND';

    // Evaluate each condition independently across all instances
    type ConditionResult = { instanceId: string; triggered: boolean; metric: string; condition: string; currentValue: string };
    const allResults: ConditionResult[] = [];

    for (const cond of conditions) {
      const points = await db
        .select()
        .from(t.metrics)
        .where(and(eq(t.metrics.metricName, cond.metric), gte(t.metrics.recordedAt, since)))
        .orderBy(desc(t.metrics.recordedAt));

      const byInstance = new Map<string, typeof points>();
      for (const p of points) {
        if (!p.instanceId) continue;
        const arr = byInstance.get(p.instanceId) || [];
        arr.push(p);
        byInstance.set(p.instanceId, arr);
      }

      for (const [instanceId, instancePoints] of byInstance) {
        const condTriggered = instancePoints.some(p => this.evaluateCondition(cond.condition, parseFloat(p.value)));
        allResults.push({
          instanceId,
          triggered: condTriggered,
          metric: cond.metric,
          condition: cond.condition,
          currentValue: instancePoints[0]?.value || '0',
        });
      }
    }

    // Group by instance and apply operator
    const byInstance = new Map<string, ConditionResult[]>();
    for (const r of allResults) {
      const arr = byInstance.get(r.instanceId) || [];
      arr.push(r);
      byInstance.set(r.instanceId, arr);
    }

    for (const [instanceId, results] of byInstance) {
      const triggered = op === 'AND'
        ? results.every(r => r.triggered)
        : results.some(r => r.triggered);

      const existing = await alertService.findFiringAlert(scope, rule.id, instanceId);

      if (triggered && !existing) {
        // 检查静默窗口
        const silenced = await silenceService.isSilenced(scope, rule.id, instanceId);
        if (silenced) continue;

        const cooldownMinutes = 10;
        const lastResolved = await alertService.findLastResolvedAlert(scope, rule.id, instanceId, cooldownMinutes);
        if (lastResolved) continue;

        const inst = await db.select().from(t.instances).where(eq(t.instances.id, instanceId)).limit(1);
        const instName = inst[0]?.name || instanceId;
        const details = results.map(r => `${r.metric} ${r.condition} (${r.currentValue})`).join(` ${op} `);
        const message = `告警「${rule.name}」：实例 ${instName} 复合条件 [${details}]`;

        const alert = await alertService.createAlert(scope, {
          ruleId: rule.id,
          instanceId,
          severity: rule.severity as AlertSeverity,
          message,
        });

        await notifyService.notify(rule.actions as any, alert.message, rule.severity as AlertSeverity);
        await eventPublisher.publish('alert.fired', { alertId: alert.id, ruleId: rule.id, instanceId, severity: rule.severity });

        this.requestAiAnalysis(scope, alert.id, {
          ruleName: rule.name,
          metric: results.map(r => r.metric).join(', '),
          condition: results.map(r => r.condition).join(` ${op} `),
          currentValue: results.map(r => r.currentValue).join(', '),
          instanceName: instName,
          instanceId,
          severity: rule.severity,
          message,
        }).catch(err => console.error(`AI analysis for alert ${alert.id} failed:`, err));

        remediationEngine.onAlertFired(scope, alert.id, instanceId, rule.metric, results[0]?.currentValue || '0')
          .catch(err => console.error(`Remediation for alert ${alert.id} failed:`, err));

      } else if (!triggered && existing) {
        await alertService.resolveAlert(scope, existing.id, 10);
        await eventPublisher.publish('alert.resolved', { alertId: existing.id, ruleId: rule.id, instanceId });
      }
    }
  }

  /**
   * 异步请求 ai-gateway 进行告警根因分析
   */
  private async requestAiAnalysis(scope: RequestScope, alertId: string, params: {
    ruleName: string;
    metric: string;
    condition: string;
    currentValue: string;
    instanceName: string;
    instanceId?: string;
    severity: string;
    message: string;
  }): Promise<void> {
    const res = await fetch(`${config.aiGatewayUrl}/internal/analyze-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
      },
      body: JSON.stringify({ alertId, ...params, scope: scope.schema }),
    });
    if (!res.ok) {
      throw new Error(`ai-gateway responded ${res.status}`);
    }
    const data = await res.json() as { analysis: string };
    await alertService.updateAiAnalysis(scope, alertId, data.analysis);
  }

  /**
   * 评估条件，支持 "> 85%" / "< 10" / "> 100" 等格式
   */
  private evaluateCondition(condition: string, value: number): boolean {
    const match = condition.match(/^(>=|<=|>|<|==)\s*([\d.]+)/);
    if (!match) return false;
    const op = match[1];
    const threshold = parseFloat(match[2]);
    switch (op) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(min|h|s|d)$/);
    if (!match) return 10 * 60 * 1000; // 默认 10 分钟
    const num = parseInt(match[1]);
    switch (match[2]) {
      case 's': return num * 1000;
      case 'min': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return 10 * 60 * 1000;
    }
  }
}

export const alertEngine = new AlertEngine();
