import type { Request, Response, NextFunction } from 'express';

export interface ProxyAuthOptions {
  required: boolean;
}

export function proxyAuthMiddleware(options: ProxyAuthOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.required) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        });
      }
    }
    next();
  };
}

export function forwardAuthHeader(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    (req as any).forwardedAuth = authHeader;
  }
  next();
}