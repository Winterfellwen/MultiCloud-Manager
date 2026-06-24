import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { teams, users } from '../db/schema.js';

export interface CreateTeamParams {
  name: string;
}

export interface UpdateTeamParams {
  name?: string;
}

export class TeamService {
  async list() {
    return db.select().from(teams);
  }

  async getById(id: string) {
    const result = await db.select().from(teams).where(eq(teams.id, id));
    return result[0] || null;
  }

  async create(params: CreateTeamParams) {
    const result = await db.insert(teams).values(params).returning();
    return result[0];
  }

  async update(id: string, params: UpdateTeamParams) {
    const result = await db
      .update(teams)
      .set(params)
      .where(eq(teams.id, id))
      .returning();
    return result[0] || null;
  }

  async delete(id: string) {
    // Unassign all users from this team (set team_id to NULL)
    await db
      .update(users)
      .set({ teamId: null })
      .where(eq(users.teamId, id));

    // Delete the team
    const result = await db
      .delete(teams)
      .where(eq(teams.id, id))
      .returning();
    return result[0] || null;
  }

  async getMembers(teamId: string) {
    return db
      .select()
      .from(users)
      .where(eq(users.teamId, teamId));
  }

  async assignUserToTeam(userId: string, teamId: string | null) {
    const result = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    return result[0] || null;
  }
}

export const teamService = new TeamService();
