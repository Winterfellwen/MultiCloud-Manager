// 用户类型定义
import type { UserRole } from './auth';

/** 用户列表/详情接口返回结构（不含 passwordHash/apiKey） */
export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  team: string;
  teamId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** 创建用户参数（POST /auth/register） */
export interface CreateUserParams {
  username: string;
  email?: string;
  password: string;
  role?: UserRole;
  team?: string;
}

/** 创建用户响应 */
export interface CreateUserResponse {
  id: string;
  username: string;
  role: UserRole;
}

/** 更新角色参数（PATCH /users/:id/role） */
export interface UpdateRoleParams {
  role: UserRole;
}

/** 更新团队参数（PATCH /users/:id/team） */
export interface UpdateTeamParams {
  team: string;
}

/** 角色中文标签映射 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  ops_manager: '运维经理',
  ops_engineer: '运维工程师',
  viewer: '只读用户',
};

/** 角色选项（用于下拉选择） */
export const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: '管理员' },
  { value: 'ops_manager', label: '运维经理' },
  { value: 'ops_engineer', label: '运维工程师' },
  { value: 'viewer', label: '只读用户' },
];
