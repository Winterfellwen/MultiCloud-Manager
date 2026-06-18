import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { metricCollector } from './collectors/metric-collector.js';
import { alertEngine } from './services/alert-engine.js';
import { costService } from './services/cost.service.js';
import { metricRoutes } from './routes/metrics.js';
import { alertRoutes } from './routes/alerts.js';
import { costRoutes } from './routes/costs.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
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
  service: 'monitor-service',
  timestamp: new Date().toISOString(),
}));

// 注册路由（API Gateway 转发 /monitor/* 到本服务）
await app.register(metricRoutes, { prefix: '/monitor/metrics' });
await app.register(alertRoutes, { prefix: '/monitor/alerts' });
await app.register(costRoutes, { prefix: '/monitor/costs' });

// 启动后台任务
metricCollector.start();
alertEngine.start();
costService.start();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down monitor-service...');
  metricCollector.stop();
  alertEngine.stop();
  costService.stop();
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Monitor service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
