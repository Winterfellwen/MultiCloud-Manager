import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { loggerPlugin } from './middleware/logger.js';
import { healthRoutes } from './routes/health.js';
import { proxyRoutes } from './routes/proxy.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

// 允许空 JSON body（POST 请求无 body 时 content-type: application/json 不报错）
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    const text = body as string;
    if (!text || text.trim() === '') {
      done(null, null);
    } else {
      done(null, JSON.parse(text));
    }
  } catch (err) {
    done(err as Error, undefined);
  }
});

await app.register(cors);
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(loggerPlugin);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR' });
});

await app.register(healthRoutes);
await app.register(proxyRoutes);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API Gateway running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// 优雅关闭
async function shutdown(signal: string) {
  app.log.info(`Received ${signal}, shutting down...`);
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));