import { queryOne, queryAll, execute } from '../db/client';
import { NotFoundError } from '@cloudops/shared';
import type { User, UserRole } from '@cloudops/shared';

export interface UserListItem {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserDetail extends UserListItem {
  fullName: string | null;
}

export class UserService {
  async list(): Promise<UserListItem[]> {
    const rows = await queryAll<{
      id: string;
      username: string;
      email: string | null;
      role: string;
      is_active: boolean;
      last_login_at: Date | null;
      created_at: Date;
    }>('SELECT id, username, email, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC');
    
    return rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }));
  }

  async getById(id: string): Promise<UserDetail> {
    const row = await queryOne<{
      id: string;
      username: string;
      email: string | null;
      full_name: string | null;
      role: string;
      is_active: boolean;
      last_login_at: Date | null;
      created_at: Date;
    }>('SELECT id, username, email, full_name, role, is_active, last_login_at, created_at FROM users WHERE id = $1', [id]);

    if (!row) {
      throw new NotFoundError('User', id);
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      fullName: row.full_name,
      role: row.role as UserRole,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    };
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    const result = await execute(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, id]
    );
    
    if (result === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async updateStatus(id: string, isActive: boolean): Promise<void> {
    const result = await execute(
      'UPDATE users SET is_active = $1 WHERE id = $2',
      [isActive, id]
    );
    
    if (result === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async updateProfile(id: string, data: { email?: string; fullName?: string }): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(data.email);
    }
    if (data.fullName !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      params.push(data.fullName);
    }

    if (updates.length === 0) return;

    params.push(id);
    const result = await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
    
    if (result === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async delete(id: string): Promise<void> {
    const result = await execute('DELETE FROM users WHERE id = $1', [id]);
    if (result === 0) {
      throw new NotFoundError('User', id);
    }
  }
}

export const userService = new UserService();