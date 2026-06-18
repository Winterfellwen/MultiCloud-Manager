import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getConfig } from '../config';

export interface TokenPayload extends JWTPayload {
  sub: string;
  role: string;
  email?: string;
  permissions?: string[];
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

export async function signAccessToken(payload: Omit<TokenPayload, 'exp' | 'iat'>): Promise<string> {
  const config = getConfig();
  const secret = await getSecretKey();
  
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

export async function signRefreshToken(payload: Omit<TokenPayload, 'exp' | 'iat'>): Promise<string> {
  const config = getConfig();
  const secret = await getSecretKey();
  
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtRefreshExpiresIn)
    .sign(secret);
}

export async function generateTokenPair(payload: Omit<TokenPayload, 'exp' | 'iat'>): Promise<TokenPair> {
  const config = getConfig();
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);
  
  const expMatch = config.jwtExpiresIn.match(/^(\d+)([smhd])$/);
  let expiresIn = 900;
  if (expMatch) {
    const value = parseInt(expMatch[1], 10);
    const unit = expMatch[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    expiresIn = value * (multipliers[unit] ?? 1);
  }
  
  return { accessToken, refreshToken, expiresIn };
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const secret = await getSecretKey();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
  });
  return payload as TokenPayload;
}

export async function decodeToken(token: string): Promise<TokenPayload | null> {
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}