import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from './jwt';
import { AppError, UnauthorizedError, ForbiddenError } from '@cloudops/shared';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
      }
      
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      
      req.user = payload;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        next(new UnauthorizedError('Invalid or expired token'));
      }
    }
  };
}

export function optionalAuthMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
      }
      
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      
      req.user = payload;
      next();
    } catch {
      next();
    }
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(`Insufficient permissions. Required: ${allowedRoles.join(' or ')}`));
      return;
    }
    
    next();
  };
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    
    const userPermissions = req.user.permissions ?? [];
    const hasPermission = requiredPermissions.every(p => 
      userPermissions.includes(p) || userPermissions.includes('*')
    );
    
    if (!hasPermission) {
      next(new ForbiddenError(`Insufficient permissions. Required: ${requiredPermissions.join(' and ')}`));
      return;
    }
    
    next();
  };
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}