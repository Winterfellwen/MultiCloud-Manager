import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useDemoStore } from '@/stores/demo';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops_manager: '运维经理',
  ops_engineer: '运维工程师',
  viewer: '查看者',
};

interface TopbarProps {
  onToggleSidebar?: () => void;
  isMobile?: boolean;
}

export function Topbar({ onToggleSidebar, isMobile }: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const exitDemo = useDemoStore((s) => s.exitDemo);

  function handleLogout() {
    logout();
    exitDemo();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-3 md:px-6 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} title="打开菜单" className="shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="text-sm text-muted-foreground hidden sm:block shrink-0">多云管理控制台</div>
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate max-w-[80px] sm:max-w-none">{user?.username}</span>
          {user && (
            <span className="hidden sm:inline text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录" className="shrink-0">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
