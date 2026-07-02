import { useQuery } from '@tanstack/react-query';
import { capacityApi } from '@/api/capacity';

export function useCapacityRecommendations() {
  return useQuery({
    queryKey: ['capacity-recommendations'],
    queryFn: () => capacityApi.getRecommendations(),
  });
}

export function useCapacitySummary() {
  return useQuery({
    queryKey: ['capacity-summary'],
    queryFn: () => capacityApi.getSummary(),
    refetchInterval: 30000,
  });
}
