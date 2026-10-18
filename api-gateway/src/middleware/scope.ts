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
/**
 * Demo 模式总开关：仅在服务端显式设置 DEMO_MODE_ENABLED=true 时生效。
 * 客户端请求头 X-Demo-Mode 本身不可信，不能单独作为数据隔离/提权依据。
 */
const DEMO_MODE_ENABLED = process.env.DEMO_MODE_ENABLED === 'true';

export function registerScopeHook(app: import('fastify').FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const isDemo = DEMO_MODE_ENABLED && request.headers['x-demo-mode'] === 'true';
    const userId = (request.headers['x-scope-user-id'] as string) || '';
    request.scope = scopeFromDemoFlag(isDemo, userId);
  });
}
