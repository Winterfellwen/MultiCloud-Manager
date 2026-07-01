// monitor-service/src/routes/remediation.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { remediationRuns, remediationPolicies, alerts, instances } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { remediationEngine } from '../services/remediation-engine.js';

export async function remediationRoutes(app: FastifyInstance) {
  // 列出自愈记录
  app.get('/', async (request) => {
    const { status, limit } = request.query as { status?: string; limit?: string };

    const baseQuery = db.select({
      id: remediationRuns.id,
      alertId: remediationRuns.alertId,
      instanceId: remediationRuns.instanceId,
      instanceName: instances.name,
      instanceProvider: instances.provider,
      rootCause: remediationRuns.rootCause,
      actionPlan: remediationRuns.actionPlan,
      actionExecuted: remediationRuns.actionExecuted,
      status: remediationRuns.status,
      env: remediationRuns.env,
      triggeredAt: remediationRuns.triggeredAt,
      approvedAt: remediationRuns.approvedAt,
      executedAt: remediationRuns.executedAt,
      verifiedAt: remediationRuns.verifiedAt,
      verificationResult: remediationRuns.verificationResult,
      errorMessage: remediationRuns.errorMessage,
      alertMessage: alerts.message,
    })
      .from(remediationRuns)
      .leftJoin(instances, eq(remediationRuns.instanceId, instances.id))
      .leftJoin(alerts, eq(remediationRuns.alertId, alerts.id))
      .orderBy(desc(remediationRuns.triggeredAt));

    const maxLimit = parseInt(limit || '50', 10);
    const runs = status
      ? await baseQuery.where(eq(remediationRuns.status, status)).limit(maxLimit)
      : await baseQuery.limit(maxLimit);

    return runs;
  });

  // 批准并执行自愈
  app.post('/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await db.select().from(remediationRuns).where(eq(remediationRuns.id, id)).limit(1);
    if (run.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '自愈记录不存在' });
    }
    if (run[0].status !== 'pending') {
      return reply.status(400).send({ error: 'INVALID_STATUS', message: `当前状态 ${run[0].status}，无法批准` });
    }

    await remediationEngine.executeRun(id);
    return { ok: true, message: '自愈已批准并开始执行' };
  });

  // 列出自愈策略
  app.get('/policies', async () => {
    return await db.select().from(remediationPolicies).orderBy(desc(remediationPolicies.createdAt));
  });

  // 更新策略
  app.put('/policies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { autoExecute, enabled } = request.body as { autoExecute?: Record<string, boolean>; enabled?: boolean };

    const updates: Record<string, unknown> = {};
    if (autoExecute !== undefined) updates.autoExecute = autoExecute;
    if (enabled !== undefined) updates.enabled = enabled;

    await db.update(remediationPolicies).set(updates).where(eq(remediationPolicies.id, id));
    return { ok: true };
  });
}
