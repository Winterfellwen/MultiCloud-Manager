// 团队管理 API 层
import { api } from './client';
import type { Team, TeamMember, CreateTeamParams, UpdateTeamParams, AssignUserToTeamParams } from '@/types/team';

export const teamsApi = {
  // 获取团队列表
  list: () => api.get<Team[]>('/auth/teams'),

  // 获取团队详情
  getById: (id: string) => api.get<Team>(`/auth/teams/${id}`),

  // 创建团队
  create: (params: CreateTeamParams) => api.post<Team>('/auth/teams', params),

  // 更新团队
  update: (id: string, params: UpdateTeamParams) => api.patch<Team>(`/auth/teams/${id}`, params),

  // 删除团队
  delete: (id: string) => api.delete<{ success: boolean }>(`/auth/teams/${id}`),

  // 获取团队成员
  getMembers: (id: string) => api.get<TeamMember[]>(`/auth/teams/${id}/members`),

  // 分配用户到团队
  assignUserToTeam: (userId: string, params: AssignUserToTeamParams) =>
    api.patch<{ success: boolean }>(`/auth/teams/users/${userId}/team`, params),
};