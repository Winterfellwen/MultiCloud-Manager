import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.AI_GATEWAY_PORT || '3005', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // JWT（与 auth-service 共享密钥）
  jwtSecret: process.env.JWT_SECRET || 'cloudops-dev-secret',

  // PostgreSQL（复用 ai-agent 的数据库）
  databaseUrl: process.env.DATABASE_URL || 'postgres://cloudops:changeme@postgres:5432/cloudops',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',

  // SQLite（ACP event ledger 本地存储）
  sqlitePath: process.env.SQLITE_PATH || './data/acp-ledger.db',

  // LLM 配置（与 ai-agent 共享）
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // 内部服务地址
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://monitor-service:3002',

  // Agent 配置
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '120000', 10),
    maxConcurrentSessions: parseInt(process.env.ACP_MAX_CONCURRENT_SESSIONS || '10', 10),
  },
};
