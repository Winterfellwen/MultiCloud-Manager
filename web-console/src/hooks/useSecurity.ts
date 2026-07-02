import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { securityApi } from '@/api/security';

export function useSecurityFindings() {
  return useQuery({
    queryKey: ['security-findings'],
    queryFn: () => securityApi.getFindings(),
  });
}

export function useSecuritySummary() {
  return useQuery({
    queryKey: ['security-summary'],
    queryFn: () => securityApi.getSummary(),
    refetchInterval: 30000, // 30s 刷新
  });
}

export function useTriggerSecurityScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => securityApi.triggerScan(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] });
      qc.invalidateQueries({ queryKey: ['security-summary'] });
    },
  });
}
