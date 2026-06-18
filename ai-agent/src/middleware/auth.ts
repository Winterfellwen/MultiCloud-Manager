import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
}

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'cloudops-dev-secret';

/**
 * 认证中间件：从 Authorization header 解析 JWT，设置 request.user
 */
export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return;  // 未认证，request.user 保持 undefined，路由层会处理
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; username: string; role: string };
    request.user = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    // token 无效，request.user 保持 undefined
  }
}
