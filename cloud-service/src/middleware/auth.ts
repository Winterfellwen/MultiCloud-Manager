import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'crypto';
import { UnauthorizedError } from '@cloudops/shared';
import { config } from '../config.js';

/**
 * 已认证用户上下文（由本服务自行验证 JWT 后注入）。
 * 安全修复：cloud-service 此前零鉴权且被 nginx 直连（/cloud/），
 * 任何未认证请求均可读写云资源；现要求所有请求携带合法 access token。
 */
export interface AuthUser {
  id: string;
  username: string;
  role: string;
  teamId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

/** 验证 access token（HS256/384/512，HMAC 签名 + exp/iat 校验），失败返回 null */
export function verifyJwt(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    const digestMap: Record<string, string> = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };
    const digest = digestMap[header?.alg];
    if (!digest) return null;

    const expected = createHmac(digest, config.jwtSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');

    // Buffer.equals 为恒定时间比较，防时序侧信道
    const a = Buffer.from(expected);
    const b = Buffer.from(parts[2]);
    if (a.length !== b.length || !a.equals(b)) return null;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.iat && payload.iat > Math.floor(Date.now() / 1000) + 300) return null;
    if (!payload.sub) return null;

    return {
      id: payload.sub,
      username: payload.username || '',
      role: payload.role || 'viewer',
      teamId: payload.teamId ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Demo 模式总开关：仅在服务端显式设置 DEMO_MODE_ENABLED=true 时生效，
 * 客户端请求头 X-Demo-Mode 本身不可信。
 */
const DEMO_MODE_ENABLED = process.env.DEMO_MODE_ENABLED === 'true';

/** 免鉴权路径：健康检查与 Prometheus 抓取 */
const PUBLIC_PATHS = new Set(['/health', '/health/all', '/metrics']);

/** onRequest 钩子：除公开路径外一律要求合法 JWT（demo 开关关闭时） */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const path = request.url.split('?')[0];
  if (PUBLIC_PATHS.has(path)) return;

  if (DEMO_MODE_ENABLED && request.headers['x-demo-mode'] === 'true') {
    request.user = { id: 'demo-u-1', username: 'demo-admin', role: 'admin', teamId: null };
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const user = verifyJwt(authHeader.slice(7));
  if (!user) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  request.user = user;
}
