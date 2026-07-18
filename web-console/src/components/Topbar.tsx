import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, LogOut, User as UserIcon, Menu, Sun, Moon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuthStore } from '@/stores/auth';
import { useDemoStore } from '@/stores/demo';
import { useTheme } from '@/hooks/useTheme';
import { NotificationBell } from '@/components/notifications/NotificationBell';

interface TopbarProps {
  onToggleSidebar?: () => void;
  onSearchOpen?: () => void;
  onToggleCollapse?: () => void;
  sidebarCollapsed?: boolean;
  isMobile?: boolean;
}

export function Topbar({ onToggleSidebar, onSearchOpen, onToggleCollapse, sidebarCollapsed, isMobile }: TopbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const exitDemo = useDemoStore((s) => s.exitDemo);
  const { resolvedTheme, toggleTheme } = useTheme();

  function handleLogout() {
    logout();
    exitDemo();
    navigate('/login', { replace: true });
  }

  const roleLabel = user ? t(`roles.${user.role}`) : '';

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-3 md:px-6 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {isMobile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.menu')}</TooltipContent>
          </Tooltip>
        )}
        <div className="flex items-center gap-2 hidden sm:flex shrink-0">
          <img src="/logo.jpg" alt="Logo" className="h-7 w-7 rounded" />
          <span className="text-sm text-muted-foreground">{t('topbar.title')}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSearchOpen} className="shrink-0">
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>搜索 (Cmd+K)</TooltipContent>
        </Tooltip>
        {!isMobile && onToggleCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="shrink-0">
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <NotificationBell />
          </TooltipTrigger>
          <TooltipContent>{t('topbar.notifications')}</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate max-w-[80px] sm:max-w-none">{user?.username}</span>
          {user && (
            <span className="hidden sm:inline text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
              {roleLabel}
            </span>
          )}
        </div>
        <LanguageSwitcher />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="shrink-0">
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="shrink-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.logout')}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
