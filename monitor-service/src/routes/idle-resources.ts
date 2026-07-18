import type { FastifyInstance } from 'fastify';
import { idleResourceService } from '../services/idle-resource.service.js';

export async function idleResourceRoutes(app: FastifyInstance) {
  app.get('/idle-resources', async (request) => {
    return idleResourceService.detect(request.scope);
  });

  app.get('/idle-resources/savings', async (request) => {
    return idleResourceService.calculateSavings(request.scope);
  });

  app.get('/idle-summary', async (request) => {
    const idle = await idleResourceService.detect(request.scope);
    return {
      totalIdle: idle.length,
      totalMonthlyCost: idle.reduce((s, r) => s + r.monthlyCost, 0),
      potentialSavings: Math.round(idle.reduce((s, r) => s + r.monthlyCost, 0) * 0.5 * 100) / 100,
      items: idle.slice(0, 10),
    };
  });
}
