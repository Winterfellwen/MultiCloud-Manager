// web-console/src/hooks/usePredictions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';

export function usePredictions() {
  return useQuery({
    queryKey: ['predictions'],
    queryFn: () => monitorApi.getPredictions(),
  });
}

export function useRunPrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi.runPrediction(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['predictions'] }),
  });
}
