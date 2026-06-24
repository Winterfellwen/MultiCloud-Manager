import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { teams, users } from '../db/schema.js';
import { NotFoundError } from '@cloudops/shared';

export interface CreateTeamParams {
  name: string;
}

export interface UpdateTeamParams {
  name?: string;
}

export class TeamService {
  async list(): Promise<typeof teams.$inferSelect[]> {
    return db.select().from(teams);
  }

  async getById(id: string): Promise<typeof teams.$inferSelect> {
    const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError('Team', id);
    }
    return result[0];
  }

  async create(params: CreateTeamParams): Promise<typeof teams.$inferSelect> {
    const result = await db.insert(teams).values(params).returning();
    return result[0];
  }

  async update(id: string, params: UpdateTeamParams): Promise<typeof teams.$inferSelect> {
    const result = await db
      .update(teams)
      .set(params)
      .where(eq(teams.id, id))
      .returning();
    if (result.length === 0) {
      throw new NotFoundError('Team', id);
    }
    return result[0];
  }

  async delete(id: string): Promise<void> {
    const result = await db
      .delete(teams)
      .where(eq(teams.id, id))
      .returning();
    if (result.length === 0) {
      throw new NotFoundError('Team', id);
    }
  }

  async getMembers(teamId: string): Promise<Omit<typeof users.$inferSelect, 'passwordHash' | 'apiKey'>[]> {
    return db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        team: users.team,
        teamId: users.teamId,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.teamId, teamId));
  }

  async assignUserToTeam(userId: string, teamId: string | null): Promise<void> {
    const result = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    if (result.length === 0) {
      throw new NotFoundError('User', userId);
    }
  }
}

export const teamService = new TeamService();
