import type { FastifyInstance } from 'fastify';

export async function loggerPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    app.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
    });
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}