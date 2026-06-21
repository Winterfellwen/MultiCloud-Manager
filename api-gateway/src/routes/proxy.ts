import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { UnauthorizedError } from '@cloudops/shared';

interface ProxyRoute {
  prefix: string;
  target: string;
  requireAuth: boolean;
}

const routes: ProxyRoute[] = [
  { prefix: '/auth', target: config.authServiceUrl, requireAuth: false },
  { prefix: '/users', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/audit', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/cloud', target: config.cloudServiceUrl, requireAuth: true },
  { prefix: '/monitor', target: config.monitorServiceUrl, requireAuth: true },
  { prefix: '/agent', target: config.aiAgentUrl, requireAuth: true },
];

/** 验证 JWT token 有效性 */
function verifyJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    // 检查过期时间
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    
    // 检查签发时间（允许 5 分钟时钟偏差）
    if (payload.iat && payload.iat > Math.floor(Date.now() / 1000) + 300) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/** 统一的代理处理函数 */
async function proxyHandler(request: FastifyRequest, reply: FastifyReply, target: string) {
  const targetUrl = `${target}${request.url}`;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body != null;
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      ...(hasBody && { 'content-type': request.headers['content-type'] || 'application/json' }),
      ...(request.headers.authorization && {
        authorization: request.headers.authorization,
      }),
    },
    body: hasBody ? JSON.stringify(request.body) : undefined,
  });

  const data = await response.json();
  return reply.status(response.status).send(data);
}

export async function proxyRoutes(app: FastifyInstance) {
  for (const route of routes) {
    // 带通配符的路由
    app.all(`${route.prefix}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
        const token = authHeader.slice(7);
        if (!verifyJwt(token)) {
          throw new UnauthorizedError('Invalid or expired token');
        }
      }
      return proxyHandler(request, reply, route.target);
    });

    // 不带通配符的路由（精确匹配）
    app.all(`${route.prefix}`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
        const token = authHeader.slice(7);
        if (!verifyJwt(token)) {
          throw new UnauthorizedError('Invalid or expired token');
        }
      }
      return proxyHandler(request, reply, route.target);
    });
  }
}