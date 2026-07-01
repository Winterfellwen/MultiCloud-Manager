import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(['admin', 'ops_manager', 'ops_engineer', 'viewer']).optional(),
  team: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// 简单的内存速率限制器
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 分钟

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const rateLimitKey = `register:${request.ip}`;
    if (!checkRateLimit(rateLimitKey)) {
      return reply.status(429).send({ error: 'Too many requests, please try again later' });
    }
    
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input);
    return reply.status(201).send(user);
  });

  app.post('/login', async (request, reply) => {
    const rateLimitKey = `login:${request.ip}`;
    if (!checkRateLimit(rateLimitKey)) {
      return reply.status(429).send({ error: 'Too many requests, please try again later' });
    }
    
    const input = loginSchema.parse(request.body);
    const ip = request.ip;
    try {
      const tokens = await authService.login(input, ip);
      await auditService.log({
        userId: input.username,
        action: 'auth.login',
        result: 'success',
        ip,
      }).catch(() => {});
      return reply.send(tokens);
    } catch (err) {
      await auditService.log({
        userId: input.username,
        action: 'auth.login_failed',
        result: 'failure',
        ip,
      }).catch(() => {});
      throw err;
    }
  });

  app.post('/refresh', async (request, reply) => {
    const rateLimitKey = `refresh:${request.ip}`;
    if (!checkRateLimit(rateLimitKey)) {
      return reply.status(429).send({ error: 'Too many requests, please try again later' });
    }
    
    const input = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(input.refreshToken);
    return reply.send(tokens);
  });
}