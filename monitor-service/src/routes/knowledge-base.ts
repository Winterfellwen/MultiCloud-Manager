// monitor-service/src/routes/knowledge-base.ts
import type { FastifyInstance } from 'fastify';
import { knowledgeBaseService } from '../services/knowledge-base.service.js';

export async function knowledgeBaseRoutes(app: FastifyInstance) {
  // 列出知识库条目
  app.get('/', async (request) => {
    const { limit } = request.query as { limit?: string };
    return knowledgeBaseService.list(request.scope, limit ? parseInt(limit, 10) : 50);
  });

  // 语义检索相似案例
  app.get('/search', async (request) => {
    const { symptom, metric } = request.query as { symptom: string; metric: string };
    if (!symptom || !metric) {
      return { error: 'MISSING_PARAMS', message: 'symptom and metric are required' };
    }
    const cases = await knowledgeBaseService.searchSimilarCases(request.scope, symptom, metric);
    return { cases };
  });
}
