import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(['admin', 'ops_manager', 'ops_engineer', 'viewer']).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input);
    return reply.status(201).send(user);
  });

  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const ip = request.ip;
    const tokens = await authService.login(input, ip);
    return reply.send(tokens);
  });

  app.post('/refresh', async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(input.refreshToken);
    return reply.send(tokens);
  });
}