import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { auditRoutes } from './routes/audit.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

await runMigrations();

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
});

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(userRoutes, { prefix: '/users' });
await app.register(auditRoutes, { prefix: '/audit' });

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Auth service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}