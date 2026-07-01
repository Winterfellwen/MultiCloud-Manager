import type { FastifyInstance, FastifyRequest } from 'fastify';
import { scopeFromDemoFlag, type RequestScope } from '@cloudops/shared';

/**
 * Scope 中间件：读 X-Demo-Mode header，注入 request.scope
 * 必须在 auth（proxy 路由的 JWT 校验）之前执行，demo 模式跳过真实 JWT 校验
 */
declare module 'fastify' {
  interface FastifyRequest {
    scope: RequestScope;
  }
}

export async function scopePlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const isDemo = request.headers['x-demo-mode'] === 'true';
    const userId = (request.headers['x-scope-user-id'] as string) || '';
    request.scope = scopeFromDemoFlag(isDemo, userId);
  });
}
