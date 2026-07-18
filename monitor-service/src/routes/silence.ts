import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { silenceService } from '../services/silence.service.js';

const createSilenceSchema = z.object({
  name: z.string().min(1).max(256),
  ruleIds: z.array(z.string()).optional(),
  instanceIds: z.array(z.string()).optional(),
  matchExpression: z.record(z.unknown()).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().optional(),
  createdBy: z.string().optional(),
});

export async function silenceRoutes(app: FastifyInstance) {
  app.get('/silence-windows', async (request) => {
    return silenceService.list(request.scope);
  });

  app.get('/silence-windows/:id', async (request) => {
    const { id } = request.params as { id: string };
    return silenceService.getById(request.scope, id);
  });

  app.post('/silence-windows', async (request, reply) => {
    const input = createSilenceSchema.parse(request.body);
    return reply.status(201).send(await silenceService.create(request.scope, {
      ...input,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
    }));
  });

  app.put('/silence-windows/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    const update: any = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.ruleIds !== undefined) update.ruleIds = body.ruleIds;
    if (body.instanceIds !== undefined) update.instanceIds = body.instanceIds;
    if (body.matchExpression !== undefined) update.matchExpression = body.matchExpression;
    if (body.startTime !== undefined) update.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) update.endTime = new Date(body.endTime);
    if (body.reason !== undefined) update.reason = body.reason;
    return silenceService.update(request.scope, id, update);
  });

  app.delete('/silence-windows/:id', async (request) => {
    const { id } = request.params as { id: string };
    await silenceService.delete(request.scope, id);
    return { ok: true, id };
  });
}
