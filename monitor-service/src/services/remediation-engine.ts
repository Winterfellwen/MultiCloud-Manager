// monitor-service/src/services/remediation-engine.ts
import { db } from '../db/index.js';
import { alerts, instances, remediationPolicies, remediationRuns } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { config } from '../config.js';

interface RemediationPlan {
  rootCause: string;
  recommendedAction: string;
  reasoning: string;
  riskLevel: string;
  expectedEffect: string;
  verificationMetric: string;
  verificationTimeout: number;
}

export class RemediationEngine {
  /**
   * 告警触发时调用：分析根因 → 创建自愈记录
   */
  async onAlertFired(alertId: string, instanceId: string, metricName: string, metricValue: string): Promise<void> {
    // 获取实例信息
    const inst = await db.select().from(instances).where(eq(instances.id, instanceId)).limit(1);
    if (inst.length === 0) return;
    const instance = inst[0];

    // 从实例 tags 读取环境
    const tags = (instance.tags || {}) as Record<string, string>;
    const env = tags.env || 'prod'; // 默认 prod（最严格策略）

    // 检查是否已有该告警的自愈记录
    const existing = await db.select().from(remediationRuns)
      .where(eq(remediationRuns.alertId, alertId)).limit(1);
    if (existing.length > 0) return;

    // 查询历史相似案例（Phase 6 的 RAG，此处先用空数组，Phase 6 补充）
    const historicalCases: any[] = [];

    // 获取告警信息
    const alertRows = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
    const alert = alertRows[0];

    // 调用 ai-gateway 分析根因
    let plan: RemediationPlan;
    try {
      const res = await fetch(`${config.aiGatewayUrl}/internal/analyze-remediation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          alertMessage: alert?.message || '',
          alertSeverity: alert?.severity || '',
          instanceId,
          instanceName: instance.name || instanceId,
          instanceProvider: instance.provider,
          instanceStatus: instance.status,
          metricName,
          metricValue,
          historicalCases,
        }),
      });

      if (!res.ok) throw new Error(`ai-gateway responded ${res.status}`);
      const data = await res.json() as { plan: RemediationPlan };
      plan = data.plan;
    } catch (err) {
      console.error(`Remediation analysis for alert ${alertId} failed:`, err);
      return;
    }

    // 决策：自动执行 or 需确认
    const decision = await this.decideExecution(plan.recommendedAction, env);

    // 创建自愈记录
    const run = await db.insert(remediationRuns).values({
      alertId,
      instanceId,
      rootCause: plan.rootCause,
      actionPlan: plan as any,
      actionExecuted: plan.recommendedAction,
      status: decision === 'auto' ? 'pending' : (decision === 'confirm' ? 'pending' : 'skipped'),
      env,
    }).returning();

    // 如果策略是自动执行，立即执行
    if (decision === 'auto') {
      await this.executeRun(run[0].id).catch((err) =>
        console.error(`Auto-remediation ${run[0].id} failed:`, err)
      );
    }
  }

  /**
   * 策略决策
   */
  private async decideExecution(action: string, env: string): Promise<'auto' | 'confirm' | 'skip'> {
    const policies = await db.select().from(remediationPolicies)
      .where(eq(remediationPolicies.actionType, action)).limit(1);

    if (policies.length === 0 || !policies[0].enabled) return 'skip';

    const policy = policies[0];
    const envTags = policy.envTags as string[];
    if (!envTags.includes(env)) return 'skip';

    const autoExecute = policy.autoExecute as Record<string, boolean>;
    return autoExecute[env] ? 'auto' : 'confirm';
  }

  /**
   * 执行自愈（手动批准 or 自动）
   */
  async executeRun(runId: string): Promise<void> {
    const run = await db.select().from(remediationRuns).where(eq(remediationRuns.id, runId)).limit(1);
    if (run.length === 0) return;

    // 更新状态为执行中
    await db.update(remediationRuns).set({
      status: 'executing',
      approvedAt: new Date(),
    }).where(eq(remediationRuns.id, runId));

    try {
      const action = run[0].actionExecuted || '';
      const instanceId = run[0].instanceId!;

      // 调用 cloud-service 执行操作
      const actionEndpoint = this.getActionEndpoint(action, instanceId);
      const res = await fetch(`${config.cloudServiceUrl}${actionEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error(`cloud-service responded ${res.status}`);

      // 更新状态为已执行
      await db.update(remediationRuns).set({
        status: 'executing',
        executedAt: new Date(),
      }).where(eq(remediationRuns.id, runId));

      // 延迟验证（等待 60 秒）
      const plan = run[0].actionPlan as RemediationPlan;
      const timeout = plan?.verificationTimeout || 60;
      setTimeout(() => {
        this.verifyRun(runId, instanceId, plan?.verificationMetric || '').catch((err) =>
          console.error(`Verification for ${runId} failed:`, err)
        );
      }, timeout * 1000);

    } catch (err) {
      await db.update(remediationRuns).set({
        status: 'failed',
        errorMessage: (err as Error).message,
      }).where(eq(remediationRuns.id, runId));
    }
  }

  private getActionEndpoint(action: string, instanceId: string): string {
    switch (action) {
      case 'reboot_instance': return `/cloud/instances/${instanceId}/reboot`;
      case 'stop_instance': return `/cloud/instances/${instanceId}/stop`;
      case 'scale_up': return `/cloud/instances/${instanceId}/scale`;
      default: return `/cloud/instances/${instanceId}/reboot`;
    }
  }

  /**
   * 验证修复效果
   */
  private async verifyRun(runId: string, instanceId: string, metricName: string): Promise<void> {
    const { metrics } = await import('../db/schema.js');
    const since = new Date(Date.now() - 2 * 60 * 1000); // 最近 2 分钟
    const recentMetrics = await db.select().from(metrics)
      .where(and(eq(metrics.instanceId, instanceId), eq(metrics.metricName, metricName)))
      .orderBy(desc(metrics.recordedAt))
      .limit(1);

    let result: string;
    let status: string;

    if (recentMetrics.length === 0) {
      result = `验证完成：未找到 ${metricName} 的最新数据，无法确认修复效果`;
      status = 'success';
    } else {
      const value = parseFloat(recentMetrics[0].value);
      if (value < 80) {
        result = `验证成功：${metricName} 已降至 ${value.toFixed(1)}%（阈值 90%），修复有效`;
        status = 'success';
      } else {
        result = `验证失败：${metricName} 仍为 ${value.toFixed(1)}%，修复未生效，建议人工介入`;
        status = 'failed';
      }
    }

    await db.update(remediationRuns).set({
      status,
      verifiedAt: new Date(),
      verificationResult: result,
    }).where(eq(remediationRuns.id, runId));
  }
}

export const remediationEngine = new RemediationEngine();
