import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, AuthUser, JwtPayload, UserRole } from '@/types/auth';
import { parseJwt } from '@/types/auth';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

function extractUser(accessToken: string): AuthUser | null {
  try {
    const payload: JwtPayload = parseJwt(accessToken);
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (tokens: AuthTokens) => {
        const user = extractUser(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        // 清除会话持久化
        localStorage.removeItem('chat-current-session');
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      updateUser: (partial: Partial<AuthUser>) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...partial } });
        }
      },
    }),
    {
      name: 'cloudops-auth',
      // 只持久化 token，user 从 token 解析
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // 从持久化存储恢复时，从 accessToken 重新派生 user 和 isAuthenticated
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          const user = extractUser(state.accessToken);
          if (user) {
            state.user = user;
            state.isAuthenticated = true;
          } else {
            // token 无效，清除
            state.accessToken = null;
            state.refreshToken = null;
            state.user = null;
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);
