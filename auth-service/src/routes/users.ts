import type { FastifyInstance } from 'fastify';
import { userService } from '../services/user.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: requirePermission('user', 'list') }, async () => {
    return userService.list();
  });

  app.get('/:id', { preHandler: requirePermission('user', 'view') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return userService.getById(id);
  });

  app.patch('/:id/role', { preHandler: requirePermission('user', 'manage') }, async (request) => {
    const { id } = request.params as { id: string };
    const { role } = request.body as { role: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer' };
    await userService.updateRole(id, role);
    return { ok: true };
  });

  app.delete('/:id', { preHandler: requirePermission('user', 'delete') }, async (request) => {
    const { id } = request.params as { id: string };
    await userService.delete(id);
    return { ok: true };
  });
}