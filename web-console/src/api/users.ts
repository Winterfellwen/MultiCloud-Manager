// 用户管理 API 层
import { api } from './client';
import type {
  UserRow,
  CreateUserParams,
  CreateUserResponse,
  UpdateRoleParams,
  UpdateTeamParams,
} from '../types/user';

export const usersApi = {
  list: () => api.get<UserRow[]>('/users/'),
  detail: (id: string) => api.get<UserRow>(`/users/${id}`),
  updateRole: (id: string, params: UpdateRoleParams) =>
    api.patch<{ ok: boolean }>(`/users/${id}/role`, params),
  updateTeam: (id: string, params: UpdateTeamParams) =>
    api.patch<{ ok: boolean }>(`/users/${id}/team`, params),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/users/${id}`),
  create: (params: CreateUserParams) =>
    api.post<CreateUserResponse>('/auth/register', params),
};
