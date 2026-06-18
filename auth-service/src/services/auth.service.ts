import bcrypt from 'bcryptjs';
import { queryOne, query, execute } from '../db/client';
import { signAccessToken, signRefreshToken, verifyRefreshToken, generateTokenPair, type TokenPayload } from '../auth/jwt';
import { UnauthorizedError, ConflictError, NotFoundError } from '@cloudops/shared';
import type { CreateUserInput, LoginInput, UserRole } from '@cloudops/shared';

const SALT_ROUNDS = 12;

export class AuthService {
  async register(input: CreateUserInput): Promise<{ id: string; username: string; role: UserRole }> {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [input.username, input.email]
    );
    
    if (existing) {
      throw new ConflictError(`Username "${input.username}" or email "${input.email}" already exists`);
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = await queryOne<{ id: string; username: string; role: string }>(
      `INSERT INTO users (username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, role`,
      [input.username, input.email, passwordHash, input.role || 'viewer']
    );

    if (!result) {
      throw new Error('Failed to create user');
    }

    return { id: result.id, username: result.username, role: result.role as UserRole };
  }

  async login(input: LoginInput, ip?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const user = await queryOne<{ id: string; username: string; password_hash: string; role: string }>(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1 AND is_active = true',
      [input.username]
    );

    if (!user) {
      await this.logAudit(null, 'login', 'user', null, { username: input.username }, 'failure', ip);
      throw new UnauthorizedError('Invalid username or password');
    }

    const valid = await bcrypt.compare(input.password, user.password_hash);
    if (!valid) {
      await this.logAudit(user.id, 'login', 'user', null, { username: input.username }, 'failure', ip);
      throw new UnauthorizedError('Invalid username or password');
    }

    await execute(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const tokenPayload: Omit<TokenPayload, 'exp' | 'iat' | 'typ' | 'iss' | 'aud'> = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const tokens = await generateTokenPair(tokenPayload);

    await this.logAudit(user.id, 'login', 'user', user.id, { username: user.username }, 'success', ip);

    return tokens;
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = await verifyRefreshToken(refreshToken);
    
    const user = await queryOne<{ id: string; username: string; role: string }>(
      'SELECT id, username, role FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );

    if (!user) {
      throw new NotFoundError('User', payload.sub);
    }

    const tokenPayload: Omit<TokenPayload, 'exp' | 'iat' | 'typ' | 'iss' | 'aud'> = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const tokens = await generateTokenPair(tokenPayload);

    await this.logAudit(user.id, 'token_refresh', 'user', user.id, { username: user.username }, 'success');

    return tokens;
  }

  private async logAudit(
    userId: string | null,
    action: string,
    resourceType: string | null,
    resourceId: string | null,
    details: Record<string, unknown>,
    result: 'success' | 'failure',
    ip?: string
  ): Promise<void> {
    await execute(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, success, ip_address) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, resourceType, resourceId, JSON.stringify(details), result, ip]
    );
  }
}

export const authService = new AuthService();