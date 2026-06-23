import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Menu, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

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

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-3 md:px-6">
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} title="打开菜单">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="text-sm text-muted-foreground hidden sm:block">多云管理控制台</div>
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        {/* 通知按钮（带脉冲指示） */}
        <div className="relative">
          <Button variant="ghost" size="icon" title="通知">
            <Bell className="h-4 w-4" />
          </Button>
          <motion.span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            aria-label="有未读通知"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{user?.username}</span>
          {user && (
            <span className="hidden sm:inline text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
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
