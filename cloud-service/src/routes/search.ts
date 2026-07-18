import { FastifyInstance } from 'fastify';
import { SearchService } from '../services/search.service.js';

const searchService = new SearchService();

export async function searchRoutes(app: FastifyInstance) {
  app.get("/search", async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q || q.trim().length === 0) {
      return { resources: [], instances: [], alerts: [] };
    }
    return searchService.search(request.scope, q.trim(), Number(limit) || 5);
  });
}
