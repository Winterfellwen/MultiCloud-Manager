import { db } from '../db/index.js';
import { alertRules, alerts, metrics, instances } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import { config } from '../config.js';
import { alertService } from './alert.service.js';
import { notifyService } from './notify.service.js';
import { eventPublisher } from '../events/publisher.js';
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
    this.timer = setInterval(() => this.checkAll().catch(console.error), intervalMs);
    console.log(`Alert engine started (interval: ${config.alertCheckIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async checkAll() {
    const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true));
    for (const rule of rules) {
      await this.evaluateRule(rule as RuleRow).catch((err) =>
        console.error(`Rule ${rule.name} evaluation failed:`, err)
      );
    }
  }

  private async evaluateRule(rule: RuleRow) {
    const durationMs = this.parseDuration(rule.duration);
    const since = new Date(Date.now() - durationMs);

    // 查询该 metric 在 duration 窗口内的所有数据点
    const points = await db
      .select()
      .from(metrics)
      .where(and(eq(metrics.metricName, rule.metric), gte(metrics.recordedAt, since)))
      .orderBy(desc(metrics.recordedAt));

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
      const existing = await alertService.findFiringAlert(rule.id, instanceId);

      if (triggered && !existing) {
        // 触发新告警
        const inst = await db.select().from(instances).where(eq(instances.id, instanceId)).limit(1);
        const instName = inst[0]?.name || instanceId;
        const alert = await alertService.createAlert({
          ruleId: rule.id,
          instanceId,
          severity: rule.severity as AlertSeverity,
          message: `告警「${rule.name}」：实例 ${instName} 的 ${rule.metric} ${rule.condition}（当前值 ${instancePoints[0].value}）`,
        });

        // 发送通知
        await notifyService.notify(rule.actions as any, alert.message, rule.severity as AlertSeverity);

        // 发布事件
        await eventPublisher.publish('alert.fired', { alertId: alert.id, ruleId: rule.id, instanceId, severity: rule.severity });
      } else if (!triggered && existing) {
        // 条件恢复，自动解决
        await alertService.resolveAlert(existing.id);
        await eventPublisher.publish('alert.resolved', { alertId: existing.id, ruleId: rule.id, instanceId });
      }
    }
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
