import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';
import type { User, UserRole } from '@cloudops/shared';

export class UserService {
  async list(): Promise<Omit<User, 'apiKey'>[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      team: users.team,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users);
    return result.map((u) => ({ ...u, role: u.role as UserRole }));
  }

  async getById(id: string): Promise<Omit<User, 'apiKey'>> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      team: users.team,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, id)).limit(1);

    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }

    return { ...result[0], role: result[0].role as UserRole };
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    const result = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async updateTeam(id: string, team: string): Promise<void> {
    const result = await db.update(users).set({ team }).where(eq(users.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async delete(id: string): Promise<void> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }
  }
}

export const userService = new UserService();