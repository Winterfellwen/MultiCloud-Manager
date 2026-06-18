export type UserRole = 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  apiKey: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Permission {
  resource: string;
  action: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
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
