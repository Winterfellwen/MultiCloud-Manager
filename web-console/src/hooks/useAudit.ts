// 审计日志 React Query hooks
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit';
import { useDemoStore } from '../stores/demo';
import { demoAuditLogs } from '../lib/demo/demo-api';
import type { AuditLogQuery, AuditLogRow } from '../types/audit';

export function useAuditLogs(query: AuditLogQuery) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<AuditLogRow[]>({
    queryKey: ['audit', query, isDemoMode],
    queryFn: () => isDemoMode ? demoAuditLogs(query) as Promise<AuditLogRow[]> : auditApi.list(query),
    gcTime: 5 * 60_000,
  });
}
