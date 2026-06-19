import { useAuthStore } from '@/stores/auth';

const API_BASE = '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return false;
  }
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        logout();
        return false;
      }
      const tokens = await res.json();
      setTokens(tokens);
      return true;
    } catch {
      logout();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** 跳过 JWT 拦截（用于 login/refresh 本身） */
  skipAuth?: boolean;
  /** 已重试过，避免无限循环 */
  _retried?: boolean;
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false, _retried = false } = options;
  const { accessToken } = useAuthStore.getState();

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (!skipAuth && accessToken) {
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 自动刷新重试
  if (res.status === 401 && !skipAuth && !_retried) {
    const ok = await tryRefreshToken();
    if (ok) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new ApiError(401, 'UNAUTHORIZED', '认证已过期，请重新登录');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = data?.error || 'INTERNAL_ERROR';
    const message = data?.message || `请求失败 (${res.status})`;
    throw new ApiError(res.status, code, message, data?.details);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
