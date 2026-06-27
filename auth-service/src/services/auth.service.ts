import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { signAccessToken, signRefreshToken, verifyToken, verifyRefreshToken } from '../utils/jwt.js';
import { UnauthorizedError, ConflictError, NotFoundError } from '@cloudops/shared';
import type { CreateUserInput, LoginInput, AuthTokens, UserRole } from '@cloudops/shared';

const SALT_ROUNDS = 10;

export class AuthService {
  async register(input: CreateUserInput): Promise<{ id: string; username: string; role: UserRole }> {
    const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Username "${input.username}" already exists`);
    }

    // First user auto-promoted to admin
    const userCount = await db.select({ count: users.id }).from(users);
    const isFirstUser = userCount.length === 0;

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = await db.insert(users).values({
      username: input.username,
      email: input.email,
      passwordHash,
      role: input.role || (isFirstUser ? 'admin' : 'viewer'),
      team: input.team || '',
    }).returning({ id: users.id, username: users.username, role: users.role });

    return result[0] as { id: string; username: string; role: UserRole };
  }

  async login(input: LoginInput, ip?: string): Promise<AuthTokens> {
    const result = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
    if (result.length === 0) {
      throw new UnauthorizedError('Invalid username or password');
    }

    const user = result[0];
    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole, teamId: (user as any).teamId || null };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshToken);
    const result = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError('User', payload.sub);
    }

    const user = result[0];
    const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole, teamId: (user as any).teamId || null };
    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 86400,
    };
  }
}

export const authService = new AuthService();