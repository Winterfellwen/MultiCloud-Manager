import { useState, useEffect } from 'react';
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
  Bot,
  BookOpen,
  Bell,
  ChevronDown,
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

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  const NAV_GROUPS: NavGroup[] = [
    {
      label: t('nav.group.dashboard'),
      icon: LayoutDashboard,
      items: [{ label: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      label: t('nav.group.aiAgent'),
      icon: Bot,
      items: [
        { label: t('nav.chat'), to: '/chat/react', icon: MessageSquare },
        { label: t('nav.aiOps'), to: '/ai-ops', icon: Bot },
        { label: t('nav.knowledgeBase'), to: '/knowledge-base', icon: BookOpen },
      ],
    },
    {
      label: t('nav.group.resourceMgmt'),
      icon: Boxes,
      items: [
        { label: t('nav.resources'), to: '/resources', icon: Boxes, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.topology'), to: '/topology', icon: Network, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.cloudAccounts'), to: '/cloud-accounts', icon: Cloud, permission: { resource: 'instance', action: 'list' } },
      ],
    },
    {
      label: t('nav.group.monitoring'),
      icon: Activity,
      items: [
        { label: t('nav.monitor'), to: '/monitor', icon: Activity, permission: { resource: 'monitor', action: 'view' } },
        { label: t('nav.notifications'), to: '/notifications', icon: Bell },
      ],
    },
    {
      label: t('nav.group.costMgmt'),
      icon: DollarSign,
      items: [
        { label: t('nav.costs'), to: '/costs', icon: DollarSign, permission: { resource: 'cost', action: 'view' } },
      ],
    },
    {
      label: t('nav.group.system'),
      icon: Settings2,
      items: [
        { label: t('nav.tools'), to: '/tools', icon: Wrench, permission: { resource: 'instance', action: 'view' } },
        { label: t('nav.mcp'), to: '/mcp', icon: Plug, permission: { resource: 'mcp', action: 'manage' } },
        { label: t('nav.users'), to: '/users', icon: Users, permission: { resource: 'user', action: 'list' } },
        { label: t('nav.audit'), to: '/audit', icon: ScrollText, permission: { resource: 'audit', action: 'view' } },
        { label: t('nav.aiSettings'), to: '/ai-settings', icon: Settings2 },
      ],
    },
  ];

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar:expandedGroups');
    return saved ? JSON.parse(saved) : { dashboard: true, aiAgent: true, resourceMgmt: true, monitoring: true, costMgmt: true, system: true };
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar:expandedGroups', JSON.stringify(next));
      return next;
    });
  };

  const activeGroup = NAV_GROUPS.find(g => g.items.some(i => {
    const target = i.children ? i.children[0].to : i.to;
    return location.pathname === target || location.pathname.startsWith(target + '/');
  }));

  useEffect(() => {
    if (activeGroup) {
      setExpandedGroups(prev => {
        if (prev[activeGroup.label]) return prev;
        return { ...prev, [activeGroup.label]: true };
      });
    }
  }, [location.pathname]);

  const isItemActive = (item: NavItem): boolean => {
    const target = item.children ? item.children[0].to : item.to;
    return location.pathname === target || location.pathname.startsWith(target + '/');
  };

  return (
    <aside className="w-60 border-r bg-muted flex flex-col h-full">
      <div className="h-14 flex items-center px-6 border-b">
        <span className="font-bold text-lg transition-colors hover:text-primary">CloudOps AI</span>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(item => {
            if (!item.permission) return true;
            if (!user) return false;
            return hasPermission(user.role, item.permission.resource, item.permission.action);
          });
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedGroups[group.label] ?? true;

          return (
            <div key={group.label} className="space-y-0.5">
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>{group.label}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
              </button>
              {isExpanded && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.children ? item.children[0].to : item.to}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        isItemActive(item)
                          ? 'bg-background shadow-md text-foreground font-semibold ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
