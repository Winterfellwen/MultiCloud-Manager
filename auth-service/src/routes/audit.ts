import type { FastifyInstance } from 'fastify';
import { auditService } from '../services/audit.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: requirePermission('audit', 'view') }, async (request) => {
    const query = request.query as Record<string, string>;
    return auditService.query({
      userId: query.userId,
      action: query.action,
      provider: query.provider,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });
  });
}