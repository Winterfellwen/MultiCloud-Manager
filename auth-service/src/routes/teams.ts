import type { FastifyInstance } from 'fastify';
import { teamService } from '../services/team.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function teamRoutes(app: FastifyInstance) {
  // Apply auth middleware to all team routes
  app.addHook('onRequest', authenticate);

  // List all teams
  app.get('/', async (request, reply) => {
    const user = request.user;
    
    // Admin sees all teams, others see only their own team
    if (user.role === 'admin') {
      const teams = await teamService.list();
      return teams;
    }
    
    // Non-admin: use teamId from JWT payload
    if (user.teamId) {
      const team = await teamService.getById(user.teamId);
      return team ? [team] : [];
    }
    
    return [];
  });

  // Create team (admin only)
  app.post('/', {
    preHandler: requirePermission('team', 'create')
  }, async (request, reply) => {
    const { name } = request.body as { name: string };
    
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Team name is required' });
    }
    
    const team = await teamService.create({ name: name.trim() });
    return reply.status(201).send(team);
  });

  // Update team (admin only)
  app.patch('/:id', {
    preHandler: requirePermission('team', 'update')
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };
    
    const team = await teamService.update(id, { name });
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    return team;
  });

  // Delete team (admin only)
  app.delete('/:id', {
    preHandler: requirePermission('team', 'delete')
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const team = await teamService.getById(id);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    await teamService.delete(id);
    return { success: true };
  });

  // Get team members (admin only)
  app.get('/:id/members', {
    preHandler: requirePermission('team', 'read')
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const team = await teamService.getById(id);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    const members = await teamService.getMembers(id);
    return members;
  });

  // Assign user to team (admin only)
  app.patch('/users/:id/team', {
    preHandler: requirePermission('team', 'update')
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { teamId } = request.body as { teamId: string | null };
    
    await teamService.assignUserToTeam(id, teamId);
    return { success: true };
  });
}
