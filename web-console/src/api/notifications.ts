import { api } from './client';
import type { NotificationItem } from '@/types/notifications';

export const notificationsApi = {
  list: (params?: { category?: string; unread?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.unread) query.set('unread', params.unread);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return api.get<NotificationItem[]>(`/monitor/notifications${qs ? '?' + qs : ''}`);
  },
  markRead: (id: string) => api.post<NotificationItem>(`/monitor/notifications/${id}/read`),
  markAllRead: () => api.post<{ ok: true; updated: number }>('/monitor/notifications/read-all'),
  unreadCount: () => api.get<{ count: number }>('/monitor/notifications/unread-count'),
};
