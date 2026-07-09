import { create } from 'zustand';
import type { NotificationItem } from '@/types/notifications';
import { notificationsApi } from '@/api/notifications';

interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (n: NotificationItem) => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const items = await notificationsApi.list({ limit: 50 });
      set({ items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {}
  },

  markRead: async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      const items = get().items.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n
      );
      set({
        items,
        unreadCount: Math.max(0, get().unreadCount - 1),
      });
    } catch {}
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead();
      set({
        items: get().items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
        unreadCount: 0,
      });
    } catch {}
  },

  addNotification: (n: NotificationItem) => {
    set((state) => ({
      items: [n, ...state.items],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
