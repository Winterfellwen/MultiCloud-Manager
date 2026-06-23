import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import { useDemoStore } from '@/stores/demo';
import { demoListAlerts } from '@/lib/demo/demo-api';
import type { CreateAlertRuleParams, UpdateAlertRuleParams, ListAlertEventsParams } from '@/types/monitor';

export function useAlertRules() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({ queryKey: ['alert-rules', isDemoMode], queryFn: () => isDemoMode ? Promise.resolve([]) : monitorApi.listRules() });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateAlertRuleParams) => monitorApi.createRule(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useUpdateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateAlertRuleParams }) => monitorApi.updateRule(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useAlertEvents(params?: ListAlertEventsParams) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['alert-events', params, isDemoMode],
    queryFn: () => isDemoMode ? demoListAlerts() : monitorApi.listEvents(params),
  });
}

export function useResolveAlertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.resolveEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}
