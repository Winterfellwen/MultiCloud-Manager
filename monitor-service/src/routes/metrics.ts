import type { FastifyInstance } from 'fastify';
import { metricService } from '../services/metric.service.js';

export async function metricRoutes(app: FastifyInstance) {
  // 查询实例指标
  app.get('/:instanceId', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const query = request.query as { metric?: string; start?: string; end?: string; limit?: string };
    return metricService.query(request.scope, {
      instanceId,
      metricName: query.metric,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });
  });
}
