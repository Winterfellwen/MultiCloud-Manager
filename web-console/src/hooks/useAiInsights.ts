import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInsightsApi } from '@/api/aiInsights';
import type { AiInsightResponse, InsightHistoryItem } from '@/types/aiInsights';

export function useAiInsight() {
  return useQuery<AiInsightResponse>({
    queryKey: ['ai-insight'],
    queryFn: () => aiInsightsApi.getInsight(),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ['token-stats'],
    queryFn: () => aiInsightsApi.getTokenStats(),
    refetchInterval: 60 * 1000,
  });
}

export function useRefreshInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aiInsightsApi.getInsight(true),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai-insight'], data);
    },
  });
}

export function useInsightHistory() {
  return useQuery<InsightHistoryItem[]>({
    queryKey: ['insight-history'],
    queryFn: () => aiInsightsApi.getInsightHistory(),
  });
}
