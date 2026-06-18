import type { FastifyInstance } from 'fastify';
import { costService } from '../services/cost.service.js';

export async function costRoutes(app: FastifyInstance) {
  // 成本汇总（按 provider/service 聚合）
  app.get('/summary', async (request) => {
    const query = request.query as { provider?: string; start?: string; end?: string };
    return costService.getSummary({
      provider: query.provider,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
    });
  });

  // 实例月度成本
  app.get('/instances', async () => costService.getInstanceCosts());

  // 手动触发成本采集
  app.post('/collect', async () => {
    await costService.collect();
    return { ok: true, message: 'Cost collection triggered' };
  });
}
