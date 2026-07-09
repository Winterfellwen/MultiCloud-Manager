import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/stores/notifications';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CheckCheck } from 'lucide-react';
import type { NotificationItem } from '@/types/notifications';

const categoryConfig: Record<string, { label: string; color: string }> = {
  ai: { label: 'AI', color: 'text-red-500' },
  ops: { label: '运维', color: 'text-yellow-500' },
  alert: { label: '告警', color: 'text-blue-500' },
  system: { label: '系统', color: 'text-gray-500' },
};

export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, loading, fetchNotifications, markRead, markAllRead } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">{t('notifications.title')}</h1>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          <CheckCheck className="h-4 w-4 mr-1" />
          {t('notifications.markAllRead')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('notifications.empty')}</div>
      ) : (
        <div className="space-y-1">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                'w-full text-left p-4 rounded-lg border transition-colors',
                !n.readAt ? 'bg-accent/30 border-accent' : 'bg-card hover:bg-accent/10'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-sm', categoryConfig[n.category]?.color)}>●</span>
                  <span className={cn('text-sm truncate', !n.readAt && 'font-semibold')}>
                    {n.title}
                  </span>
                  {!n.readAt && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              {n.description && (
                <p className="text-sm text-muted-foreground mt-1 ml-4">{n.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
