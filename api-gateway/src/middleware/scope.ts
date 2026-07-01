import type { FastifyRequest } from 'fastify';
import { scopeFromDemoFlag, type RequestScope } from '@cloudops/shared';

/**
 * Scope 类型扩展：request.scope 贯穿请求链路
 */
declare module 'fastify' {
  interface FastifyRequest {
    scope: RequestScope;
  }
}

/**
 * 注册 scope onRequest hook。
 * 必须直接在根 app 上调用（不能用 app.register()，否则 hook 受插件封装隔离，
 * 不会传播到 sibling 插件 proxyRoutes 的路由上）。
 */
export function registerScopeHook(app: import('fastify').FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const isDemo = request.headers['x-demo-mode'] === 'true';
    const userId = (request.headers['x-scope-user-id'] as string) || '';
    request.scope = scopeFromDemoFlag(isDemo, userId);
  });
}
