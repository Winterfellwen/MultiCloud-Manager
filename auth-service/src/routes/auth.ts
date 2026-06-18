import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware';
import { AppError, ValidationError } from '@cloudops/shared';

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'ops_manager', 'ops_engineer', 'viewer']).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError('Invalid input', { errors: error.flatten().fieldErrors }));
      } else {
        next(error);
      }
    }
  };
}

export function authRoutes(app: any) {
  app.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.register(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
      const tokens = await authService.login(req.body, ip);
      res.json(tokens);
    } catch (error) {
      next(error);
    }
  });

  app.post('/refresh', validate(refreshSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await authService.refresh(req.body.refreshToken);
      res.json(tokens);
    } catch (error) {
      next(error);
    }
  });

  app.get('/profile', authMiddleware(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.sub;
      if (!userId) {
        throw new AppError('User not found in token', 'UNAUTHORIZED', 401);
      }
      
      const { userService } = await import('../services/user.service');
      const user = await userService.getById(userId);
      res.json(user);
    } catch (error) {
      next(error);
    }
  });
}