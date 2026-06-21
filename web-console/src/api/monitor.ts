import { api } from './client';
import type {
  AlertRule, CreateAlertRuleParams, UpdateAlertRuleParams,
  AlertEvent, ListAlertEventsParams,
  NotificationChannel, CreateChannelParams,
  CostSummaryItem, CostSummaryParams, InstanceCost, MetricData,
} from '@/types/monitor';

export const monitorApi = {
  listRules: () => api.get<AlertRule[]>('/monitor/alerts/rules'),
  createRule: (params: CreateAlertRuleParams) => api.post<AlertRule>('/monitor/alerts/rules', params),
  updateRule: (id: string, params: UpdateAlertRuleParams) => api.put<AlertRule>(`/monitor/alerts/rules/${id}`, params),
  deleteRule: (id: string) => api.delete<{ ok: true; id: string }>(`/monitor/alerts/rules/${id}`),
  listEvents: (params?: ListAlertEventsParams) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<AlertEvent[]>(`/monitor/alerts/events${qs ? '?' + qs : ''}`);
  },
  resolveEvent: (id: string) => api.post<{ ok: true; id: string; status: 'resolved' }>(`/monitor/alerts/events/${id}/resolve`, {}),
  listChannels: () => api.get<NotificationChannel[]>('/monitor/alerts/channels'),
  createChannel: (params: CreateChannelParams) => api.post<NotificationChannel>('/monitor/alerts/channels', params),
  deleteChannel: (id: string) => api.delete<{ ok: true; id: string }>(`/monitor/alerts/channels/${id}`),
  getCostSummary: (params?: CostSummaryParams) => {
    const query = new URLSearchParams();
    if (params?.provider) query.set('provider', params.provider);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    const qs = query.toString();
    return api.get<CostSummaryItem[]>(`/monitor/costs/summary${qs ? '?' + qs : ''}`);
  },
  getInstanceCosts: () => api.get<InstanceCost[]>('/monitor/costs/instances'),
  collectCosts: () => api.post<{ ok: true; message: string }>('/monitor/costs/collect'),
  getMetrics: (instanceId: string, params?: { metric?: string; start?: string; end?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.metric) query.set('metric', params.metric);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<MetricData[]>(`/monitor/metrics/${instanceId}${qs ? '?' + qs : ''}`);
  },
};
