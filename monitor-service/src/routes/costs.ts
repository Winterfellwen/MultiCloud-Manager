import type { FastifyInstance } from 'fastify';
import { costService } from '../services/cost.service.js';

export async function costRoutes(app: FastifyInstance) {
  // 成本汇总（按 provider/service 聚合）
  app.get('/summary', async (request) => {
    const query = request.query as { provider?: string; start?: string; end?: string };
    return costService.getSummary(request.scope, {
      provider: query.provider,
      start: query.start ? new Date(query.start) : undefined,
      end: query.end ? new Date(query.end) : undefined,
    });
  });

  // 实例月度成本
  app.get('/instances', async (request) => costService.getInstanceCosts(request.scope));

  // 成本预测
  app.get('/forecast', async (request) => {
    const query = request.query as { provider?: string; months?: string };
    return costService.getForecast(request.scope, {
      provider: query.provider,
      months: query.months ? parseInt(query.months) : 3,
    });
  });

  // 手动触发成本采集
  app.post('/collect', async (request) => {
    await costService.collect(request.scope);
    return { ok: true, message: 'Cost collection triggered' };
  });
}
