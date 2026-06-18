import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'cloudops-dev-secret',

  // 内部服务地址（docker 网络内）
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://monitor-service:3002',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',

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
