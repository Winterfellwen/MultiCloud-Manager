// 团队类型定义

/** 团队基础信息 */
export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

/** 团队成员（不含敏感字段） */
export interface TeamMember {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';
  team: string;
  teamId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** 创建团队参数 */
export interface CreateTeamParams {
  name: string;
}

/** 更新团队参数 */
export interface UpdateTeamParams {
  name?: string;
}

/** 团队列表响应 */
export type TeamListResponse = Team[];

/** 团队成员列表响应 */
export type TeamMembersResponse = TeamMember[];

/** 分配用户到团队参数 */
export interface AssignUserToTeamParams {
  teamId: string | null;
}

/** 团队中文标签映射 */
export const TEAM_LABEL = '团队';

/** 团队操作权限 */
export const TEAM_PERMISSIONS = {
  create: '创建团队',
  read: '查看团队',
  update: '编辑团队',
  delete: '删除团队',
} as const;