import dotenv from 'dotenv';
import { createHmac } from 'crypto';
dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    console.warn(`⚠️  WARNING: Missing environment variable: ${name}, using fallback`);
    return `default-${name.toLowerCase()}`;
  }
  return value;
}

/** 安全敏感变量：缺失时直接拒绝启动，禁止使用公开已知的兜底值 */
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`FATAL: ${name} 未设置或过短（<16 字符）。请设置强随机值，例如: openssl rand -hex 32`);
  }
  return value;
}

const jwtSecret = requireSecret('JWT_SECRET');

/**
 * refresh secret：优先使用独立的 JWT_REFRESH_SECRET（推荐，可单独轮换）；
 * 未设置时从 JWT_SECRET 经 HMAC-SHA256 域分离派生——
 * 既避免「未配置该变量导致服务无法启动」，也保证与 access secret 密码学独立。
 */
function resolveRefreshSecret(): string {
  const value = process.env.JWT_REFRESH_SECRET;
  if (value) {
    if (value.length < 16) {
      throw new Error('FATAL: JWT_REFRESH_SECRET 过短（<16 字符）。请设置强随机值，例如: openssl rand -hex 32');
    }
    return value;
  }
  console.warn('ℹ️  JWT_REFRESH_SECRET 未设置，已从 JWT_SECRET 派生（建议显式设置独立值以便单独轮换）');
  return createHmac('sha256', jwtSecret).update('cloudops-refresh-token-v1').digest('hex');
}

const jwtRefreshSecret = resolveRefreshSecret();

export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/cloudops'),
  jwtSecret,
  jwtRefreshSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    // 空字符串与未设置都视为"未指定"，启动时将随机生成一次
    password: process.env.ADMIN_PASSWORD || '',
  },
};
