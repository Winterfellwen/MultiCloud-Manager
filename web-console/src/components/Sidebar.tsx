import { useState, useEffect, useRef, useMemo } from 'react';
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

interface NavLeaf {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: { resource: string; action: string };
}

interface NavGroupNode {
  type: 'group';
  key: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
  defaultCollapsed?: boolean;
}

interface NavItemNode {
  type: 'item';
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  permission?: { resource: string; action: string };
}

type NavNode = NavGroupNode | NavItemNode;

interface SidebarProps {
  collapsed?: boolean;
}

function isLeafVisible(leaf: NavLeaf, user: any): boolean {
  if (!leaf.permission) return true;
  if (!user) return false;
  return hasPermission(user.role, leaf.permission.resource, leaf.permission.action);
}

function CollapsedNav({
  nodes,
  expandedGroups,
  toggleGroup,
  user,
  hoverOpen,
  onMouseEnter,
  onMouseLeave,
  onPopupMouseEnter,
  onPopupMouseLeave,
}: {
  nodes: NavNode[];
  expandedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  user: any;
  hoverOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPopupMouseEnter: () => void;
  onPopupMouseLeave: () => void;
}) {
  const firstChildTo = (node: NavGroupNode) =>
    (node.children.find((c) => isLeafVisible(c, user)) || node.children[0])?.to ?? '/';

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center justify-center w-10 h-10 rounded-lg transition-all border-l-[3px]',
      isActive
        ? 'bg-background text-foreground font-semibold border-primary shadow-sm'
        : 'text-muted-foreground border-transparent hover:bg-background/80 hover:text-foreground'
    );

  const leafClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all border-l-[3px]',
      isActive
        ? 'bg-background text-foreground font-semibold border-primary'
        : 'text-muted-foreground border-transparent hover:bg-background/80 hover:text-foreground'
    );

  return (
    <div
      className="flex flex-col items-center gap-2 py-2 relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {nodes.map((node) => {
        if (node.type === 'item') {
          if (!isLeafVisible(node, user)) return null;
          return (
            <NavLink key={node.key} to={node.to} className={itemClass}>
              <node.icon className="h-5 w-5" />
            </NavLink>
          );
        }
        const visibleChildren = node.children.filter((c) => isLeafVisible(c, user));
        if (visibleChildren.length === 0) return null;
        const groupTo = firstChildTo(node);
        const isActive =
          location.pathname === groupTo || location.pathname.startsWith(groupTo + '/');
        return (
          <NavLink
            key={node.key}
            to={groupTo}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg transition-all',
              isActive
                ? 'bg-background shadow-md text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
            )}
          >
            <node.icon className="h-5 w-5" />
          </NavLink>
        );
      })}

      {hoverOpen && (
        <div
          className="absolute left-14 top-0 z-50 w-64 bg-card border rounded-lg shadow-xl p-2 space-y-0.5"
          onMouseEnter={onPopupMouseEnter}
          onMouseLeave={onPopupMouseLeave}
        >
          {nodes.map((node) => {
            if (node.type === 'item') {
              if (!isLeafVisible(node, user)) return null;
              return (
                <NavLink key={node.key} to={node.to} className={leafClass}>
                  <node.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{node.label}</span>
                </NavLink>
              );
            }
            const visibleChildren = node.children.filter((c) => isLeafVisible(c, user));
            if (visibleChildren.length === 0) return null;
            const isExpanded = expandedGroups[node.key] ?? !node.defaultCollapsed;
            return (
              <div key={node.key} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(node.key)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <node.icon className="h-4 w-4 shrink-0" />
                    {node.label}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                  <div className="space-y-0.5 pl-2">
                    {visibleChildren.map((child) => (
                      <NavLink key={child.to} to={child.to} className={leafClass}>
                        <child.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{child.label}</span>
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

  const NAV_NODES: NavNode[] = [
    { type: 'item', key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, to: '/dashboard' },
    { type: 'item', key: 'costs', label: t('nav.costs'), icon: DollarSign, to: '/costs', permission: { resource: 'cost', action: 'view' } },
    {
      type: 'group', key: 'aiAgent', label: t('nav.group.aiAgent'), icon: Bot, children: [
        { label: t('nav.chat'), to: '/chat/react', icon: MessageSquare },
        { label: t('nav.aiOps'), to: '/ai-ops', icon: Bot },
        { label: t('nav.knowledgeBase'), to: '/knowledge-base', icon: BookOpen },
        { label: t('nav.aiSettings'), to: '/ai-settings', icon: Settings2 },
      ],
    },
    {
      type: 'group', key: 'resourceMgmt', label: t('nav.group.resourceMgmt'), icon: Boxes, children: [
        { label: t('nav.resources'), to: '/resources', icon: Boxes, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.topology'), to: '/topology', icon: Network, permission: { resource: 'instance', action: 'list' } },
        { label: t('nav.cloudAccounts'), to: '/cloud-accounts', icon: Cloud, permission: { resource: 'instance', action: 'list' } },
      ],
    },
    {
      type: 'group', key: 'monitoring', label: t('nav.group.monitoring'), icon: Activity, children: [
        { label: t('nav.monitor'), to: '/monitor', icon: Activity, permission: { resource: 'monitor', action: 'view' } },
        { label: t('nav.notifications'), to: '/notifications', icon: Bell },
      ],
    },
    {
      type: 'group', key: 'admin', label: t('nav.group.admin'), icon: Users, children: [
        { label: t('nav.users'), to: '/users', icon: Users, permission: { resource: 'user', action: 'list' } },
        { label: t('nav.audit'), to: '/audit', icon: ScrollText, permission: { resource: 'audit', action: 'view' } },
      ],
    },
    {
      type: 'group', key: 'system', label: t('nav.group.system'), icon: Settings2, defaultCollapsed: true, children: [
        { label: t('nav.tools'), to: '/tools', icon: Wrench, permission: { resource: 'instance', action: 'view' } },
        { label: t('nav.mcp'), to: '/mcp', icon: Plug, permission: { resource: 'mcp', action: 'manage' } },
      ],
    },
  ];

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar:expandedGroups');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  useEffect(() => {
    localStorage.setItem('sidebar:expandedGroups', JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  const activeGroupKey = useMemo(() => {
    for (const node of NAV_NODES) {
      if (node.type === 'group') {
        if (node.children.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))) {
          return node.key;
        }
      }
    }
    return undefined;
  }, [location.pathname]);

  useEffect(() => {
    if (activeGroupKey) {
      setExpandedGroups((prev) => {
        if (prev[activeGroupKey]) return prev;
        return { ...prev, [activeGroupKey]: true };
      });
    }
  }, [location.pathname, activeGroupKey]);

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

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border-l-[3px]',
      isActive
        ? 'bg-background text-foreground font-semibold border-primary shadow-sm'
        : 'text-muted-foreground border-transparent hover:bg-background/80 hover:text-foreground'
    );

  const leafClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors border-l-[3px]',
      isActive
        ? 'bg-background text-foreground font-semibold border-primary'
        : 'text-muted-foreground border-transparent hover:bg-background/80 hover:text-foreground'
    );

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
            nodes={NAV_NODES}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            user={user}
            hoverOpen={hoverOpen}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPopupMouseEnter={handlePopupMouseEnter}
            onPopupMouseLeave={handlePopupMouseLeave}
          />
        ) : (
          NAV_NODES.map((node) => {
            if (node.type === 'item') {
              if (!isLeafVisible(node, user)) return null;
              return (
                <div key={node.key} className="mb-2">
                  <NavLink to={node.to} className={itemClass}>
                    <node.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{node.label}</span>
                  </NavLink>
                </div>
              );
            }

            const visibleChildren = node.children.filter((c) => isLeafVisible(c, user));
            if (visibleChildren.length === 0) return null;

            const isExpanded = expandedGroups[node.key] ?? !node.defaultCollapsed;

            return (
              <div key={node.key} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(node.key)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <node.icon className="h-4 w-4 shrink-0" />
                    {node.label}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isExpanded && 'rotate-180')} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-200', isExpanded ? 'max-h-[1000px]' : 'max-h-0')}>
                  <div className="space-y-0.5 pl-2">
                    {visibleChildren.map((child) => (
                      <NavLink key={child.to} to={child.to} className={leafClass}>
                        <child.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
