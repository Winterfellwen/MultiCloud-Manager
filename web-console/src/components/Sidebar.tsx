import { useState, useEffect, useRef } from 'react';
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
}

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

interface SidebarProps {
  collapsed?: boolean;
}

function CollapsedNav({
  groups,
  activeGroup,
  expandedGroups,
  toggleGroup,
  isItemActive,
  user,
  hoverOpen,
  onMouseEnter,
  onMouseLeave,
  onPopupMouseEnter,
  onPopupMouseLeave,
}: {
  groups: NavGroup[];
  activeGroup?: NavGroup;
  expandedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  isItemActive: (item: NavItem) => boolean;
  user: any;
  hoverOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPopupMouseEnter: () => void;
  onPopupMouseLeave: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 py-2 relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {groups.map(group => {
        const visibleItems = group.items.filter(item => {
          if (!item.permission) return true;
          if (!user) return false;
          return hasPermission(user.role, item.permission.resource, item.permission.action);
        });
        if (visibleItems.length === 0) return null;

        const isActive = activeGroup?.key === group.key;
        return (
          <NavLink
            key={group.key}
            to={visibleItems[0].to}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg transition-all',
              isActive
                ? 'bg-background shadow-md text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
            )}
          >
            <group.icon className="h-5 w-5" />
          </NavLink>
        );
      })}

      {hoverOpen && (
        <div
          className="absolute left-14 top-0 z-50 w-64 bg-card border rounded-lg shadow-xl p-2"
          onMouseEnter={onPopupMouseEnter}
          onMouseLeave={onPopupMouseLeave}
        >
          {groups.map(group => {
            const visibleItems = group.items.filter(item => {
              if (!item.permission) return true;
              if (!user) return false;
              return hasPermission(user.role, item.permission.resource, item.permission.action);
            });
            if (visibleItems.length === 0) return null;

            const isExpanded = expandedGroups[group.key] ?? true;

            return (
              <div key={group.key} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <group.icon className="h-4 w-4 shrink-0" />
                    {group.label}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                  <div className="space-y-0.5">
                    {visibleItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
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
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  const NAV_GROUPS: NavGroup[] = [
    {
      key: 'dashboard',
      label: t('nav.group.dashboard'),
      icon: LayoutDashboard,
      items: [{ label: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      key: 'aiAgent',
      label: t('nav.group.aiAgent'),
      icon: Bot,
      items: [
        { label: t('nav.chat'), to: '/chat/react', icon: MessageSquare },
        { label: t('nav.aiOps'), to: '/ai-ops', icon: Bot },
        { label: t('nav.knowledgeBase'), to: '/knowledge-base', icon: BookOpen },
      ],
    },
    {
      key: 'resourceMgmt',
      label: t('nav.group.resourceMgmt'),
      icon: Boxes,
      items: [
        { label: t('nav.resources'), to: '/resources', icon: Boxes, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.topology'), to: '/topology', icon: Network, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.cloudAccounts'), to: '/cloud-accounts', icon: Cloud, permission: { resource: 'instance', action: 'list' } },
      ],
    },
    {
      key: 'monitoring',
      label: t('nav.group.monitoring'),
      icon: Activity,
      items: [
        { label: t('nav.monitor'), to: '/monitor', icon: Activity, permission: { resource: 'monitor', action: 'view' } },
        { label: t('nav.notifications'), to: '/notifications', icon: Bell },
      ],
    },
    {
      key: 'costMgmt',
      label: t('nav.group.costMgmt'),
      icon: DollarSign,
      items: [
        { label: t('nav.costs'), to: '/costs', icon: DollarSign, permission: { resource: 'cost', action: 'view' } },
      ],
    },
    {
      key: 'system',
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
    try {
      const saved = localStorage.getItem('sidebar:expandedGroups');
      return saved ? JSON.parse(saved) : { dashboard: true, aiAgent: true, resourceMgmt: true, monitoring: true, costMgmt: true, system: true };
    } catch {
      return { dashboard: true, aiAgent: true, resourceMgmt: true, monitoring: true, costMgmt: true, system: true };
    }
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    localStorage.setItem('sidebar:expandedGroups', JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  const activeGroup = NAV_GROUPS.find(g => g.items.some(i => {
    return location.pathname === i.to || location.pathname.startsWith(i.to + '/');
  }));

  useEffect(() => {
    if (activeGroup) {
      setExpandedGroups(prev => {
        if (prev[activeGroup.key]) return prev;
        return { ...prev, [activeGroup.key]: true };
      });
    }
  }, [location.pathname, activeGroup]);

  const isItemActive = (item: NavItem): boolean => {
    return location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  };

  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(hoverTimerRef.current);
  }, []);

  useEffect(() => {
    setHoverOpen(false);
  }, [location.pathname]);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => setHoverOpen(true), 300);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverOpen(false), 300);
  };

  const handlePopupMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    setHoverOpen(true);
  };
  const handlePopupMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverOpen(false), 300);
  };

  return (
    <aside className={cn('w-60 border-r bg-muted flex flex-col h-full relative', collapsed && 'w-14')}>
      <div className={cn('h-14 flex items-center border-b', collapsed ? 'justify-center px-0' : 'px-6')}>
        {collapsed ? (
          <LayoutDashboard className="h-5 w-5 text-primary" />
        ) : (
          <span className="font-bold text-lg transition-colors hover:text-primary">CloudOps AI</span>
        )}
      </div>
      <nav className={cn('flex-1 overflow-y-auto', collapsed ? 'p-1' : 'p-2 space-y-1')}>
        {collapsed ? (
          <CollapsedNav
            groups={NAV_GROUPS}
            activeGroup={activeGroup}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            isItemActive={isItemActive}
            user={user}
            hoverOpen={hoverOpen}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPopupMouseEnter={handlePopupMouseEnter}
            onPopupMouseLeave={handlePopupMouseLeave}
          />
        ) : (
          NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(item => {
              if (!item.permission) return true;
              if (!user) return false;
              return hasPermission(user.role, item.permission.resource, item.permission.action);
            });
            if (visibleItems.length === 0) return null;

            const isExpanded = expandedGroups[group.key] ?? true;

            return (
              <div key={group.key} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <group.icon className="h-4 w-4 shrink-0" />
                    {group.label}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                  <div className="space-y-0.5">
                    {visibleItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
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
          })
        )}
      </nav>
    </aside>
  );
}
