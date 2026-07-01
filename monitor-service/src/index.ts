import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { metricCollector } from './collectors/metric-collector.js';
import { alertEngine } from './services/alert-engine.js';
import { costService } from './services/cost.service.js';
import { metricRoutes } from './routes/metrics.js';
import { alertRoutes } from './routes/alerts.js';
import { costRoutes } from './routes/costs.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { metricsExportRoutes } from './routes/metrics-export.js';
import { predictionRoutes } from './routes/predictions.js';
import { predictionEngine } from './services/prediction-engine.js';
import { AppError } from '@cloudops/shared';
import { runMigrations } from './db/migrate.js';

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
  // PostgreSQL 错误（如 UUID 格式错误）
  const err = error as any;
  if (err.code && err.severity) {
    return reply.status(400).send({
      error: 'DATABASE_ERROR',
      message: `数据库查询失败: ${err.message}`,
    });
  }
  app.log.error(error);
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: `服务内部错误: ${error.message || '未知错误'}`,
  });
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
await app.register(dashboardRoutes, { prefix: '/monitor/dashboard' });
await app.register(metricsExportRoutes);
await app.register(predictionRoutes, { prefix: '/monitor/predictions' });

// 运行数据库迁移
try {
  await runMigrations();
  console.log('✅ Monitor service database migrations completed');
} catch (err) {
  console.error('⚠️  Monitor service migration failed:', (err as Error).message);
}

// 启动后台任务（即使数据库失败也尝试启动）
try { metricCollector.start(); } catch (e) { console.error('metricCollector failed:', (e as Error).message); }
try { alertEngine.start(); } catch (e) { console.error('alertEngine failed:', (e as Error).message); }
try { costService.start(); } catch (e) { console.error('costService failed:', (e as Error).message); }
try { predictionEngine.start(); } catch (e) { console.error('predictionEngine failed:', (e as Error).message); }

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down monitor-service...');
  metricCollector.stop();
  alertEngine.stop();
  costService.stop();
  predictionEngine.stop();
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
