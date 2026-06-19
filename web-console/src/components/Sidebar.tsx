import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Activity,
  DollarSign,
  MessageSquare,
  Users,
  ScrollText,
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

const NAV_ITEMS: NavItem[] = [
  { label: '总览', to: '/dashboard', icon: LayoutDashboard },
  {
    label: '云资源',
    to: '/instances',
    icon: Server,
    permission: { resource: 'instance', action: 'list' },
  },
  {
    label: '监控告警',
    to: '/monitor',
    icon: Activity,
    permission: { resource: 'monitor', action: 'view' },
  },
  {
    label: '成本分析',
    to: '/costs',
    icon: DollarSign,
    permission: { resource: 'cost', action: 'view' },
  },
  {
    label: 'AI 对话',
    to: '/chat/react',
    icon: MessageSquare,
    children: [
      { label: 'React 版', to: '/chat/react' },
      { label: 'Lit 版', to: '/chat/lit' },
    ],
  },
  {
    label: '用户管理',
    to: '/users',
    icon: Users,
    permission: { resource: 'user', action: 'list' },
  },
  {
    label: '审计日志',
    to: '/audit',
    icon: ScrollText,
    permission: { resource: 'audit', action: 'view' },
  },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (!user) return false;
    return hasPermission(user.role, item.permission.resource, item.permission.action);
  });

  return (
    <aside className="w-60 border-r bg-card flex flex-col">
      <div className="h-14 flex items-center px-6 border-b">
        <span className="font-bold text-lg">CloudOps AI</span>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <div key={item.to}>
            <NavLink
              to={item.children ? item.children[0].to : item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
            {item.children && (
              <div className="ml-6 mt-1 space-y-1">
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
