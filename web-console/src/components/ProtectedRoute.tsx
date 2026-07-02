import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/types/auth';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: { resource: string; action: string };
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !hasPermission(user.role as UserRole, permission.resource, permission.action)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">{t('common.noPermission')}</h2>
          <p className="text-sm text-muted-foreground mt-2">{t('common.noPermissionDesc')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
