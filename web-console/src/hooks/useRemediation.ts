// web-console/src/hooks/useRemediation.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';

export function useRemediationRuns(status?: string) {
  return useQuery({
    queryKey: ['remediation-runs', status],
    queryFn: () => monitorApi.getRemediationRuns({ status }),
  });
}

export function useApproveRemediation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.approveRemediation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediation-runs'] }),
  });
}

export function useRemediationPolicies() {
  return useQuery({
    queryKey: ['remediation-policies'],
    queryFn: () => monitorApi.getRemediationPolicies(),
  });
}

export function useCreateRemediationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; actionType: string; resourceType?: string | null; envTags?: string[]; autoExecute?: Record<string, boolean> }) =>
      monitorApi.createRemediationPolicy(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediation-policies'] }),
  });
}

export function useUpdateRemediationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: { name?: string; actionType?: string; resourceType?: string | null; autoExecute?: Record<string, boolean>; enabled?: boolean } }) =>
      monitorApi.updateRemediationPolicy(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediation-policies'] }),
  });
}

export function useDeleteRemediationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.deleteRemediationPolicy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediation-policies'] }),
  });
}
