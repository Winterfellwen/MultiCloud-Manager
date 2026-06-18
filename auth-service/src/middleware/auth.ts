import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '@cloudops/shared';
import type { UserRole } from '@cloudops/shared';
import { ROLE_PERMISSIONS } from '@cloudops/shared';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    request.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requirePermission(resource: string, action: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user;
    const permissions = ROLE_PERMISSIONS[role];

    const hasPermission = permissions.some(
      (p) =>
        (p.resource === '*' || p.resource === resource) &&
        (p.action === '*' || p.action === action)
    );

    if (!hasPermission) {
      throw new ForbiddenError(`Insufficient permissions: ${resource}:${action}`);
    }
  };
}