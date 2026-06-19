import { api } from './client';
import type { AuthTokens } from '@/types/auth';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  role?: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';
}

export const authApi = {
  login: (params: LoginParams) =>
    api.post<AuthTokens>('/auth/login', params, { skipAuth: true }),

  refresh: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refreshToken }, { skipAuth: true }),

  register: (params: RegisterParams) =>
    api.post<{ id: string; username: string; role: string }>('/auth/register', params, {
      skipAuth: true,
    }),
};
