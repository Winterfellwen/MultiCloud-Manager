import type { FastifyInstance } from 'fastify';
import { exchangeRateService } from '../services/exchange-rate.service.js';

export async function exchangeRateRoutes(app: FastifyInstance) {
  app.get('/exchange-rate', async (request) => {
    const { from, to, amount } = request.query as { from?: string; to?: string; amount?: string };
    const result = await exchangeRateService.convert(Number(amount) || 1, from || 'USD', to || 'USD');
    return { from: from || 'USD', to: to || 'USD', amount: Number(amount) || 1, result };
  });
}
