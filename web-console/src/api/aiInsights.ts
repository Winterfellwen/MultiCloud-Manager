import { api } from './client';
import type { AiInsight, TokenStats, InsightHistoryItem } from '@/types/aiInsights';

export const aiInsightsApi = {
  getInsight(refresh?: boolean): Promise<AiInsight> {
    const qs = refresh ? '?refresh=true' : '';
    return api.get<AiInsight>(`/monitor/dashboard/ai-insight${qs}`);
  },
  getTokenStats(): Promise<TokenStats> {
    return api.get<TokenStats>('/monitor/dashboard/token-stats');
  },
  getInsightHistory(): Promise<InsightHistoryItem[]> {
    return api.get<InsightHistoryItem[]>('/monitor/dashboard/ai-insight/history');
  },
};
