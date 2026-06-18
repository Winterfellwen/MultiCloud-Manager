import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { userService } from '../services/user.service';
import { authMiddleware, requireRole, requirePermission } from '../auth/middleware';
import { AppError, ValidationError } from '@cloudops/shared';

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'ops_manager', 'ops_engineer', 'viewer']),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().max(200).optional(),
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

export function userRoutes(app: any) {
  app.use(authMiddleware());

  app.get('/', requirePermission('user', 'list'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await userService.list();
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  app.get('/:id', requirePermission('user', 'view'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.getById(req.params.id);
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/:id/role', requirePermission('user', 'manage'), validate(updateRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.updateRole(req.params.id, req.body.role);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/:id/status', requirePermission('user', 'manage'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        throw new ValidationError('isActive must be a boolean');
      }
      await userService.updateStatus(req.params.id, isActive);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/:id/profile', requirePermission('user', 'manage'), validate(updateProfileSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.updateProfile(req.params.id, req.body);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/:id', requirePermission('user', 'delete'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.delete(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}