import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, desc } from 'drizzle-orm';
import { config } from '../config.js';
import { alertService } from './alert.service.js';
import { notifyService } from './notify.service.js';
import { eventPublisher } from '../events/publisher.js';
import { remediationEngine } from './remediation-engine.js';
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

    // 查询该 metric 在 duration 窗口内的所有数据点
    const points = await db
      .select()
      .from(t.metrics)
      .where(and(eq(t.metrics.metricName, rule.metric), gte(t.metrics.recordedAt, since)))
      .orderBy(desc(t.metrics.recordedAt));

    if (points.length === 0) return;

    // 按 instanceId 分组评估
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
        // 触发新告警
        const inst = await db.select().from(t.instances).where(eq(t.instances.id, instanceId)).limit(1);
        const instName = inst[0]?.name || instanceId;
        const alert = await alertService.createAlert(scope, {
          ruleId: rule.id,
          instanceId,
          severity: rule.severity as AlertSeverity,
          message: `告警「${rule.name}」：实例 ${instName} 的 ${rule.metric} ${rule.condition}（当前值 ${instancePoints[0].value}）`,
        });

        // 发送通知
        await notifyService.notify(rule.actions as any, alert.message, rule.severity as AlertSeverity);

        // 发布事件
        await eventPublisher.publish('alert.fired', { alertId: alert.id, ruleId: rule.id, instanceId, severity: rule.severity });

        // 异步调用 AI 根因分析（不阻断告警流程）
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

        // 触发自愈引擎（异步，不阻断告警流程）
        remediationEngine.onAlertFired(scope, alert.id, instanceId, rule.metric, String(instancePoints[0].value))
          .catch((err) => console.error(`Remediation for alert ${alert.id} failed:`, err));
      } else if (!triggered && existing) {
        // 条件恢复，自动解决
        await alertService.resolveAlert(scope, existing.id);
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
