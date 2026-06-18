import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { alertService } from '../services/alert.service.js';
import { db } from '../db/index.js';
import { notificationChannels } from '../db/schema.js';

const createRuleSchema = z.object({
  name: z.string().min(1).max(128),
  metric: z.string().min(1),
  condition: z.string().min(1),
  duration: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  actions: z.array(z.object({ type: z.enum(['notify', 'suggest', 'auto']), targets: z.array(z.string()) })),
  enabled: z.boolean().optional(),
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(['webhook', 'email', 'slack']),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

export async function alertRoutes(app: FastifyInstance) {
  // ---- 告警规则 ----
  app.get('/rules', async () => alertService.listRules());

  app.get('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    return alertService.getRule(id);
  });

  app.post('/rules', async (request, reply) => {
    const input = createRuleSchema.parse(request.body);
    return reply.status(201).send(await alertService.createRule(input));
  });

  app.put('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    return alertService.updateRule(id, request.body as any);
  });

  app.delete('/rules/:id', async (request) => {
    const { id } = request.params as { id: string };
    await alertService.deleteRule(id);
    return { ok: true, id };
  });

  // ---- 告警事件 ----
  app.get('/events', async (request) => {
    const query = request.query as { status?: string; severity?: string; limit?: string };
    return alertService.listAlerts({
      status: query.status as any,
      severity: query.severity as any,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });
  });

  app.post('/events/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };
    await alertService.resolveAlert(id);
    return { ok: true, id, status: 'resolved' };
  });

  // ---- 通知渠道 ----
  app.get('/channels', async () => db.select().from(notificationChannels));

  app.post('/channels', async (request, reply) => {
    const input = createChannelSchema.parse(request.body);
    const result = await db.insert(notificationChannels).values(input).returning();
    return reply.status(201).send(result[0]);
  });

  app.delete('/channels/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(notificationChannels).where(eq(notificationChannels.id, id));
    return { ok: true, id };
  });
}
