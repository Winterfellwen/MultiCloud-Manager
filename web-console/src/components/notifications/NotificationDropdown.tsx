import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/stores/notifications';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { NotificationItem } from '@/types/notifications';

const categoryConfig: Record<string, { label: string; color: string }> = {
  ai: { label: 'AI', color: 'text-red-500' },
  ops: { label: '运维', color: 'text-yellow-500' },
  alert: { label: '告警', color: 'text-blue-500' },
  system: { label: '系统', color: 'text-gray-500' },
};

interface Props {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, unreadCount, markRead, markAllRead } = useNotificationStore();

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) markRead(n.id);
    if (n.link) {
      navigate(n.link);
      onClose();
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifications.justNow');
    if (mins < 60) return `${mins}${t('notifications.minAgo')}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}${t('notifications.hourAgo')}`;
    return `${Math.floor(hours / 24)}${t('notifications.dayAgo')}`;
  };

  const grouped = items.reduce<Record<string, NotificationItem[]>>((acc, n) => {
    if (!acc[n.category]) acc[n.category] = [];
    acc[n.category].push(n);
    return acc;
  }, {});

  return (
    <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-card border rounded-lg shadow-lg z-50 max-h-[60vh] flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">{t('notifications.title')}</h3>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
            {t('notifications.markAllRead')}
          </Button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('notifications.empty')}
          </div>
        ) : (
          Object.entries(grouped).map(([category, notifs]) => (
            <div key={category}>
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span className={cn('text-base leading-none', categoryConfig[category]?.color)}>●</span>
                {categoryConfig[category]?.label || category}
              </div>
              {notifs.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors',
                    !n.readAt && 'bg-accent/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('font-medium truncate', !n.readAt && 'font-semibold')}>
                      {n.title}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {n.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => { navigate('/notifications'); onClose(); }}
        >
          {t('notifications.viewAll')}
        </Button>
      </div>
    </div>
  );
}
