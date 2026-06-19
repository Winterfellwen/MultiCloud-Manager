// 审计日志 API 层
import { api } from './client';
import type { AuditLogQuery, AuditLogRow } from '../types/audit';

export const auditApi = {
  list: (query?: AuditLogQuery) => {
    const params = new URLSearchParams();
    if (query?.userId) params.set('userId', query.userId);
    if (query?.action) params.set('action', query.action);
    if (query?.provider) params.set('provider', query.provider);
    if (query?.startDate) params.set('startDate', query.startDate);
    if (query?.endDate) params.set('endDate', query.endDate);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    return api.get<AuditLogRow[]>(`/audit/${qs ? `?${qs}` : ''}`);
  },
};
