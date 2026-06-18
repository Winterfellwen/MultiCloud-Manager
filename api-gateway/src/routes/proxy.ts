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

export async function proxyRoutes(app: FastifyInstance) {
  for (const route of routes) {
    app.all(`${route.prefix}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
      }

      const targetUrl = `${route.target}${request.url}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'content-type': request.headers['content-type'] || 'application/json',
          ...(request.headers.authorization && {
            authorization: request.headers.authorization,
          }),
        },
        body: ['POST', 'PUT', 'PATCH'].includes(request.method)
          ? JSON.stringify(request.body)
          : undefined,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    });

    app.all(`${route.prefix}`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
      }

      const targetUrl = `${route.target}${request.url}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'content-type': request.headers['content-type'] || 'application/json',
          ...(request.headers.authorization && {
            authorization: request.headers.authorization,
          }),
        },
        body: ['POST', 'PUT', 'PATCH'].includes(request.method)
          ? JSON.stringify(request.body)
          : undefined,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    });
  }
}