import type { FastifyInstance } from 'fastify';
import { auditService } from '../services/audit.service.js';
import type { AuditEntry } from '@cloudops/shared';

/**
 * 内部审计写入端点（不鉴权，仅供内部服务调用）
 * api-gateway 不代理 /internal 前缀，外部无法访问。
 */
export async function internalAuditRoutes(app: FastifyInstance) {
  app.post('/audit', async (request, reply) => {
    const body = request.body as Partial<AuditEntry>;
    if (!body.userId || !body.action) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'userId and action are required' });
    }
    await auditService.log({
      userId: body.userId,
      action: body.action,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      provider: body.provider,
      region: body.region,
      params: body.params,
      result: body.result ?? 'success',
      ip: body.ip,
      traceId: body.traceId,
    });
    return reply.status(201).send({ ok: true });
  });
}
