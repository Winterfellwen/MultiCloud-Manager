// JWT 认证（魔改：替换 OpenClaw 的设备配对 + ed25519 签名）
// CloudOps 使用标准 JWT，与 auth-service 共享密钥

import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
  team: string;
}

/**
 * 从 WebSocket 升级请求中解析 JWT
 * 支持两种方式：query 参数 ?token=xxx 或 Authorization header
 */
export function parseTokenFromRequest(
  query: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>
): string | null {
  // query 参数优先
  const queryToken = query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  // Authorization header
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * 验证 JWT，返回用户信息
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      username: string;
      role: string;
      team: string;
    };
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      team: payload.team || '',
    };
  } catch {
    return null;
  }
}
