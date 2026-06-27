import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { UserRole } from '@cloudops/shared';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  teamId: string | null;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: '7d' as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as JwtPayload;
}