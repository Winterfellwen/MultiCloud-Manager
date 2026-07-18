import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { budgetService } from '../services/budget.service.js';

const createBudgetSchema = z.object({
  name: z.string().min(1).max(128),
  provider: z.string().min(1),
  service: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().optional(),
  period: z.enum(['monthly', 'quarterly', 'yearly']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  notifyThreshold: z.number().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
});

export async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets', async (request) => budgetService.list(request.scope));

  app.get('/budgets/vs-actual', async (request) => budgetService.getBudgetVsActual(request.scope));

  app.get('/budgets/:id', async (request) => {
    const { id } = request.params as { id: string };
    return budgetService.getById(request.scope, id);
  });

  app.post('/budgets', async (request, reply) => {
    const input = createBudgetSchema.parse(request.body);
    return reply.status(201).send(await budgetService.create(request.scope, {
      ...input,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    }));
  });

  app.put('/budgets/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    const update: any = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.provider !== undefined) update.provider = body.provider;
    if (body.service !== undefined) update.service = body.service;
    if (body.amount !== undefined) update.amount = body.amount;
    if (body.currency !== undefined) update.currency = body.currency;
    if (body.period !== undefined) update.period = body.period;
    if (body.startDate !== undefined) update.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) update.endDate = new Date(body.endDate);
    if (body.notifyThreshold !== undefined) update.notifyThreshold = body.notifyThreshold;
    if (body.enabled !== undefined) update.enabled = body.enabled;
    return budgetService.update(request.scope, id, update);
  });

  app.delete('/budgets/:id', async (request) => {
    const { id } = request.params as { id: string };
    await budgetService.delete(request.scope, id);
    return { ok: true, id };
  });
}
