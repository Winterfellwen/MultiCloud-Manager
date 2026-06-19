import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/types/auth';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: { resource: string; action: string };
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !hasPermission(user.role as UserRole, permission.resource, permission.action)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">权限不足</h2>
          <p className="text-sm text-muted-foreground mt-2">您没有访问此页面的权限</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
