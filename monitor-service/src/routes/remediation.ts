// monitor-service/src/routes/remediation.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc } from 'drizzle-orm';
import { remediationEngine } from '../services/remediation-engine.js';

export async function remediationRoutes(app: FastifyInstance) {
  // 列出自愈记录
  app.get('/', async (request) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const { status, limit } = request.query as { status?: string; limit?: string };

    const baseQuery = db.select({
      id: t.remediationRuns.id,
      alertId: t.remediationRuns.alertId,
      instanceId: t.remediationRuns.instanceId,
      instanceName: t.instances.name,
      instanceProvider: t.instances.provider,
      rootCause: t.remediationRuns.rootCause,
      actionPlan: t.remediationRuns.actionPlan,
      actionExecuted: t.remediationRuns.actionExecuted,
      status: t.remediationRuns.status,
      env: t.remediationRuns.env,
      triggeredAt: t.remediationRuns.triggeredAt,
      approvedAt: t.remediationRuns.approvedAt,
      executedAt: t.remediationRuns.executedAt,
      verifiedAt: t.remediationRuns.verifiedAt,
      verificationResult: t.remediationRuns.verificationResult,
      errorMessage: t.remediationRuns.errorMessage,
      alertMessage: t.alerts.message,
    })
      .from(t.remediationRuns)
      .leftJoin(t.instances, eq(t.remediationRuns.instanceId, t.instances.id))
      .leftJoin(t.alerts, eq(t.remediationRuns.alertId, t.alerts.id))
      .orderBy(desc(t.remediationRuns.triggeredAt));

    const maxLimit = parseInt(limit || '50', 10);
    const runs = status
      ? await baseQuery.where(eq(t.remediationRuns.status, status)).limit(maxLimit)
      : await baseQuery.limit(maxLimit);

    return runs;
  });

  // 批准并执行自愈
  app.post('/:id/approve', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const { id } = request.params as { id: string };
    const run = await db.select().from(t.remediationRuns).where(eq(t.remediationRuns.id, id)).limit(1);
    if (run.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '自愈记录不存在' });
    }
    if (run[0].status !== 'pending') {
      return reply.status(400).send({ error: 'INVALID_STATUS', message: `当前状态 ${run[0].status}，无法批准` });
    }

    await remediationEngine.executeRun(scope, id);
    return { ok: true, message: '自愈已批准并开始执行' };
  });

  // 列出自愈策略
  app.get('/policies', async (request) => {
    const t = scopedDb(request.scope);
    return await db.select().from(t.remediationPolicies).orderBy(desc(t.remediationPolicies.createdAt));
  });

  // 创建自愈策略
  app.post('/policies', async (request, reply) => {
    const t = scopedDb(request.scope);
    const { name, actionType, resourceType, envTags, autoExecute } = request.body as {
      name: string;
      actionType: string;
      resourceType?: string;
      envTags?: string[];
      autoExecute?: Record<string, boolean>;
    };

    if (!name || !actionType) {
      return reply.status(400).send({ error: 'VALIDATION', message: 'name 和 actionType 必填' });
    }

    const [policy] = await db.insert(t.remediationPolicies).values({
      name,
      actionType,
      resourceType: resourceType || null,
      envTags: envTags || ['dev', 'uat', 'prod'],
      autoExecute: autoExecute || { dev: false, uat: false, prod: false },
    }).returning();

    return policy;
  });

  // 更新策略
  app.put('/policies/:id', async (request, reply) => {
    const t = scopedDb(request.scope);
    const { id } = request.params as { id: string };
    const { name, actionType, resourceType, autoExecute, enabled } = request.body as {
      name?: string;
      actionType?: string;
      resourceType?: string | null;
      autoExecute?: Record<string, boolean>;
      enabled?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (actionType !== undefined) updates.actionType = actionType;
    if (resourceType !== undefined) updates.resourceType = resourceType;
    if (autoExecute !== undefined) updates.autoExecute = autoExecute;
    if (enabled !== undefined) updates.enabled = enabled;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'VALIDATION', message: '无更新字段' });
    }

    await db.update(t.remediationPolicies).set(updates).where(eq(t.remediationPolicies.id, id));
    return { ok: true };
  });

  // 删除自愈策略
  app.delete('/policies/:id', async (request, reply) => {
    const t = scopedDb(request.scope);
    const { id } = request.params as { id: string };

    const deleted = await db.delete(t.remediationPolicies).where(eq(t.remediationPolicies.id, id)).returning();
    if (deleted.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '策略不存在' });
    }
    return { ok: true };
  });
}
