import { useQuery, useMutation } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights';

export function useAiInsight() {
  return useQuery({
    queryKey: ['ai-insight'],
    queryFn: aiInsightsApi.getInsight,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ['token-stats'],
    queryFn: aiInsightsApi.getTokenStats,
    refetchInterval: 60 * 1000,
  });
}

export function useRefreshInsight() {
  return useMutation({
    mutationFn: () => aiInsightsApi.getInsight(true),
  });
}

export function useInsightHistory() {
  return useQuery({
    queryKey: ['insight-history'],
    queryFn: aiInsightsApi.getInsightHistory,
  });
}
