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
  port: parseInt(process.env.PORT || '3002', 10),
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/cloudops'),
  redisUrl: requireEnv('REDIS_URL', 'redis://127.0.0.1:6379'),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // cloud-service 内部地址（docker 网络内服务间调用，不走 gateway）
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',

  // 采集间隔（秒）
  metricCollectIntervalSec: parseInt(process.env.METRIC_COLLECT_INTERVAL || '300', 10),
  // 告警检查间隔（秒）
  alertCheckIntervalSec: parseInt(process.env.ALERT_CHECK_INTERVAL || '60', 10),
  // 成本采集间隔（秒，默认每日）
  costCollectIntervalSec: parseInt(process.env.COST_COLLECT_INTERVAL || '86400', 10),

  // 邮件通知（可选）
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'cloudops@noreply.com',
  },
};
