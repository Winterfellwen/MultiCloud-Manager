import type { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { authMiddleware, requirePermission } from '../auth/middleware';
import { AppError } from '@cloudops/shared';

export function auditRoutes(app: any) {
  app.use(authMiddleware());

  app.get('/', requirePermission('audit', 'view'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query;
      const filters: any = {};

      if (query.userId) filters.userId = query.userId as string;
      if (query.action) filters.action = query.action as string;
      if (query.provider) filters.provider = query.provider as string;
      if (query.startDate) filters.startDate = new Date(query.startDate as string);
      if (query.endDate) filters.endDate = new Date(query.endDate as string);
      if (query.limit) filters.limit = parseInt(query.limit as string, 10);
      if (query.offset) filters.offset = parseInt(query.offset as string, 10);

      const logs = await auditService.query(filters);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  app.get('/:id', requirePermission('audit', 'view'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const log = await auditService.getById(req.params.id);
      if (!log) {
        throw new AppError('Audit log not found', 'NOT_FOUND', 404);
      }
      res.json(log);
    } catch (error) {
      next(error);
    }
  });
}