import { api } from './client';
import type { AiInsight, TokenStats } from '@/types/aiInsights';

export const aiInsightsApi = {
  getInsight(): Promise<AiInsight> {
    return api.get<AiInsight>('/monitor/dashboard/ai-insight');
  },
  getTokenStats(): Promise<TokenStats> {
    return api.get<TokenStats>('/monitor/dashboard/token-stats');
  },
};
