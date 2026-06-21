import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    console.warn(`⚠️  WARNING: Missing environment variable: ${name}, using fallback`);
    return `default-${name.toLowerCase()}`;
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3004',
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://127.0.0.1:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://127.0.0.1:3002',
  aiAgentUrl: process.env.AI_AGENT_URL || 'http://127.0.0.1:3003',
  jwtSecret: requireEnv('JWT_SECRET', 'render-development-jwt-secret-change-me'),
};