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
  port: parseInt(process.env.PORT || '3003', 10),
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/cloudops'),
  redisUrl: requireEnv('REDIS_URL', 'redis://127.0.0.1:6379'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: requireEnv('JWT_SECRET', 'render-development-jwt-secret-change-me'),

  // 内部服务地址（docker 网络内）
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://127.0.0.1:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://127.0.0.1:3002',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3004',

  // LLM 配置（OpenAI 兼容 API）
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // Agent 配置
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '120000', 10),
  },
};
