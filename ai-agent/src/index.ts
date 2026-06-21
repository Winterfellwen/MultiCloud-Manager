// AI Agent Service 入口

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { sessionRoutes } from './routes/sessions.js';
import { chatRoutes } from './routes/chat.js';
import { wsRoutes } from './routes/ws.js';
import { eventSubscriber } from './events/subscriber.js';
import { AppError } from '@cloudops/shared';
import { authMiddleware } from './middleware/auth.js';
import { runMigrations } from './db/migrate.js';

// 导入 hooks handlers（副作用注册）
import './hooks/handlers/approval-handler.js';
import './hooks/handlers/audit-handler.js';
// 导入工具 descriptors（副作用注册）
import './tools/descriptors/cloud-tools.js';
import './tools/descriptors/monitor-tools.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  if (error.validation) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
});

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-agent',
  timestamp: new Date().toISOString(),
}));

// 注册路由（API Gateway 转发 /agent/* 到本服务）
// 全局 preHandler：解析 JWT 设置 request.user
app.addHook('preHandler', authMiddleware);

await app.register(sessionRoutes, { prefix: '/agent/sessions' });
await app.register(chatRoutes, { prefix: '/agent/chat' });
await app.register(wsRoutes, { prefix: '/agent/ws' });

// 运行数据库迁移
await runMigrations();

// 启动事件订阅
eventSubscriber.start();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down ai-agent...');
  eventSubscriber.stop();
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`AI Agent service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
