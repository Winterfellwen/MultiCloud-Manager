// 审计日志 React Query hooks
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit';
import type { AuditLogQuery, AuditLogRow } from '../types/audit';

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery<AuditLogRow[]>({
    queryKey: ['audit', query],
    queryFn: () => auditApi.list(query),
    gcTime: 5 * 60_000,
  });
}
