import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/all', async (request, reply) => {
    const services = [
      { name: 'auth-service', url: config.authServiceUrl },
      { name: 'cloud-service', url: config.cloudServiceUrl },
      { name: 'monitor-service', url: config.monitorServiceUrl },
      { name: 'ai-agent', url: config.aiAgentUrl },
    ];

    const results: Record<string, string> = {};

    for (const service of services) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${service.url}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        results[service.name] = response.ok ? 'ok' : 'error';
      } catch {
        results[service.name] = 'error';
      }
    }

    return { status: 'ok', services: results };
  });
}