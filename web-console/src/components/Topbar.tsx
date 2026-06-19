import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops_manager: '运维经理',
  ops_engineer: '运维工程师',
  viewer: '查看者',
};

export function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6">
      <div className="text-sm text-muted-foreground">多云管理控制台</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{user?.username}</span>
          {user && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
