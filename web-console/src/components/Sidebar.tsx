import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Activity,
  DollarSign,
  MessageSquare,
  Users,
  ScrollText,
  Wrench,
  Plug,
  Settings2,
  Cloud,
  Boxes,
  Network,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/types/auth';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: { resource: string; action: string };
  children?: Array<{ label: string; to: string }>;
}

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  const NAV_ITEMS: NavItem[] = [
    { label: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard },
    {
      label: t('nav.chat'),
      to: '/chat/react',
      icon: MessageSquare,
    },
    {
      label: t('nav.resources'),
      to: '/resources',
      icon: Boxes,
      permission: { resource: 'instance', action: 'list' },
    },
    {
      label: t('nav.topology'),
      to: '/topology',
      icon: Network,
      permission: { resource: 'instance', action: 'list' },
    },
    {
      label: t('nav.cloudAccounts'),
      to: '/cloud-accounts',
      icon: Cloud,
      permission: { resource: 'instance', action: 'list' },
    },
    {
      label: t('nav.monitor'),
      to: '/monitor',
      icon: Activity,
      permission: { resource: 'monitor', action: 'view' },
    },
    {
      label: t('nav.costs'),
      to: '/costs',
      icon: DollarSign,
      permission: { resource: 'cost', action: 'view' },
    },
    {
      label: t('nav.aiSettings'),
      to: '/ai-settings',
      icon: Settings2,
    },
    {
      label: t('nav.tools'),
      to: '/tools',
      icon: Wrench,
      permission: { resource: 'instance', action: 'view' },
    },
    {
      label: t('nav.mcp'),
      to: '/mcp',
      icon: Plug,
      permission: { resource: 'mcp', action: 'manage' },
    },
    {
      label: t('nav.users'),
      to: '/users',
      icon: Users,
      permission: { resource: 'user', action: 'list' },
    },
    {
      label: t('nav.audit'),
      to: '/audit',
      icon: ScrollText,
      permission: { resource: 'audit', action: 'view' },
    },
  ];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (!user) return false;
    return hasPermission(user.role, item.permission.resource, item.permission.action);
  });

  const isItemActive = (item: NavItem): boolean => {
    const target = item.children ? item.children[0].to : item.to;
    return location.pathname === target || location.pathname.startsWith(target + '/');
  };

  return (
    <aside className="w-60 border-r bg-muted/50 flex flex-col h-full">
      <div className="h-14 flex items-center px-6 border-b">
        <span className="font-bold text-lg transition-colors hover:text-primary">CloudOps AI</span>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = isItemActive(item);
          return (
            <div key={item.to}>
            <NavLink
              to={item.children ? item.children[0].to : item.to}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                'transition-all duration-150',
                isActive
                  ? 'bg-background shadow-md text-foreground font-semibold ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
              {item.children && (
                <div className="ml-6 mt-1 space-y-1">
                  {item.children.map((child) => {
                    const childActive = location.pathname === child.to;
                    return (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                          'transition-all duration-150',
                          childActive
                            ? 'bg-background shadow-md text-foreground font-semibold ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
                        )}
                      >
                        {child.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
