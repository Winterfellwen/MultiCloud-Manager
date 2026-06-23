// 审计日志 React Query hooks（demo 模式走 mock）
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit';
import { useDemoStore } from '../stores/demo';
import { demoListAuditLogs } from '../lib/demo/demo-api';
import type { AuditLogQuery, AuditLogRow } from '../types/audit';

export function useAuditLogs(query: AuditLogQuery) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery<AuditLogRow[]>({
    queryKey: ['audit', query, isDemoMode],
    queryFn: () => (isDemoMode ? demoListAuditLogs(query) : auditApi.list(query)),
  });
}
