import type { Request, Response } from 'express';
import { config } from '../config';

export function healthRoutes(app: any) {
  app.get('/health', async (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/all', async (req: Request, res: Response) => {
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

    res.json({
      status: 'ok',
      services: results,
    });
  });
}