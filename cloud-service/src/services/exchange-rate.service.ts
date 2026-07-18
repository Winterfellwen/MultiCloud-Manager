import { redis } from '../db/redis.js';

interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

const CACHE_KEY = 'exchange:rates';
const CACHE_TTL = 86400;
const API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

const FALLBACK_RATES: Record<string, number> = { CNY: 7.2, USD: 1 };

export class ExchangeRateService {
  async getRates(): Promise<ExchangeRates> {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
      const data = (await res.json()) as ExchangeRates;
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
      return data;
    } catch {
      return { base: 'USD', rates: FALLBACK_RATES, timestamp: Date.now() };
    }
  }

  async convert(amount: number, from: string, to: string = 'USD'): Promise<number> {
    const rates = await this.getRates();
    if (from === to) return amount;
    const fromRate = rates.rates[from.toUpperCase()];
    const toRate = rates.rates[to.toUpperCase()];
    if (!fromRate || !toRate) return amount;
    return (amount / fromRate) * toRate;
  }
}

export const exchangeRateService = new ExchangeRateService();
