import { SignJWT, jwtVerify, type JWTPayload, errors as joseErrors } from 'jose';
import bcrypt from 'bcryptjs';
import { getConfig } from '../config';
import { UnauthorizedError } from '@cloudops/shared';

export type TokenType = 'access' | 'refresh';

export interface TokenPayload extends JWTPayload {
  sub: string;
  role: string;
  email?: string;
  permissions?: string[];
  typ: TokenType;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const encoder = new TextEncoder();

async function getSecretKey(): Promise<Uint8Array> {
  const config = getConfig();
  return encoder.encode(config.jwtSecret);
}

function getIssuer(): string {
  return 'cloudops-auth';
}

function getAudience(): string {
  return 'cloudops-api';
}

export async function signAccessToken(payload: Omit<TokenPayload, 'exp' | 'iat' | 'typ' | 'iss' | 'aud'>): Promise<string> {
  const config = getConfig();
  const secret = await getSecretKey();
  
  if (!payload.sub || !payload.role) {
    throw new Error('Token payload must contain sub and role');
  }
  
  return new SignJWT({ ...payload, typ: 'access' as TokenType })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

export async function signRefreshToken(payload: Omit<TokenPayload, 'exp' | 'iat' | 'typ' | 'iss' | 'aud'>): Promise<string> {
  const config = getConfig();
  const secret = await getSecretKey();
  
  if (!payload.sub || !payload.role) {
    throw new Error('Token payload must contain sub and role');
  }
  
  return new SignJWT({ ...payload, typ: 'refresh' as TokenType })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .setExpirationTime(config.jwtRefreshExpiresIn)
    .sign(secret);
}

export async function generateTokenPair(payload: Omit<TokenPayload, 'exp' | 'iat' | 'typ' | 'iss' | 'aud'>): Promise<TokenPair> {
  const config = getConfig();
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);
  
  const expMatch = config.jwtExpiresIn.match(/^(\d+)([smhdw])$/);
  let expiresIn = 900;
  if (expMatch) {
    const value = parseInt(expMatch[1], 10);
    const unit = expMatch[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    expiresIn = value * (multipliers[unit] ?? 1);
  }
  
  return { accessToken, refreshToken, expiresIn };
}

export async function verifyToken(token: string, expectedType: TokenType = 'access'): Promise<TokenPayload> {
  const secret = await getSecretKey();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: getIssuer(),
    audience: getAudience(),
  });
  
  if (payload.typ !== expectedType) {
    throw new UnauthorizedError(`Invalid token type: expected ${expectedType}`);
  }
  
  return payload as TokenPayload;
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  return verifyToken(token, 'access');
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  return verifyToken(token, 'refresh');
}

export async function decodeToken(token: string): Promise<TokenPayload | null> {
  try {
    return await verifyAccessToken(token);
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired || error instanceof joseErrors.JWSInvalid) {
      return null;
    }
    throw error;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}