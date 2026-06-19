export type UserRole = 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/** 角色权限定义（与后端 shared/src/types/user.ts 对齐） */
export const ROLE_PERMISSIONS: Record<UserRole, Array<{ resource: string; action: string }>> = {
  admin: [{ resource: '*', action: '*' }],
  ops_manager: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'instance', action: 'start' },
    { resource: 'instance', action: 'stop' },
    { resource: 'instance', action: 'reboot' },
    { resource: 'monitor', action: 'view' },
    { resource: 'alert', action: 'manage' },
    { resource: 'cost', action: 'view' },
    { resource: 'report', action: 'generate' },
  ],
  ops_engineer: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'instance', action: 'start' },
    { resource: 'instance', action: 'stop' },
    { resource: 'instance', action: 'reboot' },
    { resource: 'exec', action: 'command' },
  ],
  viewer: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'monitor', action: 'view' },
    { resource: 'cost', action: 'view' },
  ],
};

/** 检查角色是否拥有指定权限 */
export function hasPermission(role: UserRole, resource: string, action: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.some(
    (p) =>
      (p.resource === '*' || p.resource === resource) &&
      (p.action === '*' || p.action === action)
  );
}

/** 解析 JWT payload（不验证签名，仅前端用，使用浏览器 atob） */
export function parseJwt(token: string): JwtPayload {
  const payload = token.split('.')[1];
  const decoded = atob(payload);
  return JSON.parse(decoded);
}
