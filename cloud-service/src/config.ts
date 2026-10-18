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

/** 安全敏感变量：缺失时直接拒绝启动，与 auth-service 签发端保持同一把持 */
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`FATAL: ${name} 未设置或过短（<16 字符）。请设置强随机值，例如: openssl rand -hex 32`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/cloudops'),
  redisUrl: requireEnv('REDIS_URL', 'redis://127.0.0.1:6379'),
  jwtSecret: requireSecret('JWT_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // auth-service 内部地址（docker 网络内服务间调用）
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',

  // Cloud provider configs
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    roleArn: process.env.AWS_ROLE_ARN,
  },
  aliyun: {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    region: process.env.ALIYUN_REGION || 'cn-hangzhou',
  },
  azure: {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
  },
};