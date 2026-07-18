import { api } from './client';

const FALLBACK_RATES: Record<string, number> = { CNY: 7.2, USD: 1 };

export async function getExchangeRate(from: string, to: string = 'USD'): Promise<number> {
  try {
    const res = await api.get<{ result: number }>(`/cloud/exchange-rate?from=${from}&to=${to}&amount=1`);
    return res.result;
  } catch {
    return FALLBACK_RATES[from] || 1;
  }
}
