// monitor-service/src/services/remediation-engine.ts
import { db } from '../db/index.js';
import { scopedDb, type RequestScope } from '@cloudops/shared';
import { eq, and, desc } from 'drizzle-orm';
import { config } from '../config.js';
import { knowledgeBaseService } from './knowledge-base.service.js';

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
  async onAlertFired(scope: RequestScope, alertId: string, instanceId: string, metricName: string, metricValue: string): Promise<void> {
    const t = scopedDb(scope);
    // 获取实例信息
    const inst = await db.select().from(t.instances).where(eq(t.instances.id, instanceId)).limit(1);
    if (inst.length === 0) return;
    const instance = inst[0];

    // 从实例 tags 读取环境
    const tags = (instance.tags || {}) as Record<string, string>;
    const env = tags.env || 'prod'; // 默认 prod（最严格策略）

    // 检查是否已有该告警的自愈记录
    const existing = await db.select().from(t.remediationRuns)
      .where(eq(t.remediationRuns.alertId, alertId)).limit(1);
    if (existing.length > 0) return;

    // 查询历史相似案例（RAG 检索）
    let historicalCases: any[] = [];
    try {
      const symptom = `${instance.name || instanceId} ${metricName} = ${metricValue}`;
      const cases = await knowledgeBaseService.searchSimilarCases(scope, symptom, metricName);
      historicalCases = cases;
    } catch (err) {
      console.warn('RAG retrieval failed, continuing without historical context:', (err as Error).message);
    }

    // 获取告警信息
    const alertRows = await db.select().from(t.alerts).where(eq(t.alerts.id, alertId)).limit(1);
    const alert = alertRows[0];

    // 调用 ai-gateway 分析根因
    let plan: RemediationPlan;
    try {
      const res = await fetch(`${config.aiGatewayUrl}/internal/analyze-remediation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Mode': scope.isDemo ? 'true' : 'false',
        },
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
          scope: scope.schema,
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
    const decision = await this.decideExecution(scope, plan.recommendedAction, env);

    // 创建自愈记录
    const run = await db.insert(t.remediationRuns).values({
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
      await this.executeRun(scope, run[0].id).catch((err) =>
        console.error(`Auto-remediation ${run[0].id} failed:`, err)
      );
    }
  }

  /**
   * 策略决策
   */
  private async decideExecution(scope: RequestScope, action: string, env: string): Promise<'auto' | 'confirm' | 'skip'> {
    const t = scopedDb(scope);
    const policies = await db.select().from(t.remediationPolicies)
      .where(eq(t.remediationPolicies.actionType, action)).limit(1);

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
  async executeRun(scope: RequestScope, runId: string): Promise<void> {
    const t = scopedDb(scope);
    const run = await db.select().from(t.remediationRuns).where(eq(t.remediationRuns.id, runId)).limit(1);
    if (run.length === 0) return;

    // 更新状态为执行中
    await db.update(t.remediationRuns).set({
      status: 'executing',
      approvedAt: new Date(),
    }).where(eq(t.remediationRuns.id, runId));

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
      await db.update(t.remediationRuns).set({
        status: 'executing',
        executedAt: new Date(),
      }).where(eq(t.remediationRuns.id, runId));

      // 延迟验证（等待 60 秒）
      const plan = run[0].actionPlan as RemediationPlan;
      const timeout = plan?.verificationTimeout || 60;
      setTimeout(() => {
        this.verifyRun(scope, runId, instanceId, plan?.verificationMetric || '').catch((err) =>
          console.error(`Verification for ${runId} failed:`, err)
        );
      }, timeout * 1000);

    } catch (err) {
      await db.update(t.remediationRuns).set({
        status: 'failed',
        errorMessage: (err as Error).message,
      }).where(eq(t.remediationRuns.id, runId));
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
  private async verifyRun(scope: RequestScope, runId: string, instanceId: string, metricName: string): Promise<void> {
    const t = scopedDb(scope);
    const since = new Date(Date.now() - 2 * 60 * 1000); // 最近 2 分钟
    const recentMetrics = await db.select().from(t.metrics)
      .where(and(eq(t.metrics.instanceId, instanceId), eq(t.metrics.metricName, metricName)))
      .orderBy(desc(t.metrics.recordedAt))
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

    await db.update(t.remediationRuns).set({
      status,
      verifiedAt: new Date(),
      verificationResult: result,
    }).where(eq(t.remediationRuns.id, runId));

    // 写入知识库
    knowledgeBaseService.recordExperience(scope, runId).catch((err) =>
      console.error(`Knowledge base recording for ${runId} failed:`, err)
    );
  }
}

export const remediationEngine = new RemediationEngine();
