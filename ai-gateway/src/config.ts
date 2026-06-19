import dotenv from 'dotenv';
dotenv.config();

// ============ 类型定义 ============

export interface LLMModelConfig {
  id: string;
  name: string;
  /** 上下文窗口大小（token 数） */
  contextWindow?: number;
  /** 是否支持推理（reasoning）模式 */
  reasoning?: boolean;
  /** 输入类型：text / image / audio 等 */
  input?: string[];
}

export interface LLMProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: LLMModelConfig[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  /** 启动命令 */
  command: string;
  /** 启动参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
}

// ============ 解析辅助函数 ============

/**
 * 安全解析 JSON 环境变量，失败时返回空数组
 */
function parseJsonEnv<T>(envValue: string | undefined, fallback: T): T {
  if (!envValue || envValue.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(envValue);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 解析多 provider 配置
 * 环境变量 LLM_PROVIDERS 是 JSON 字符串，格式：
 * [{id, name, baseUrl, apiKey, models: [{id, name, contextWindow?, reasoning?, input?}]}]
 */
function parseLlmProviders(): LLMProviderConfig[] {
  const providers = parseJsonEnv<LLMProviderConfig[]>(
    process.env.LLM_PROVIDERS,
    []
  );
  return providers.filter(p => p && p.id && p.baseUrl);
}

/**
 * 解析 MCP server 配置
 * 环境变量 MCP_SERVERS 是 JSON 字符串，格式：
 * [{id, name, command, args?, env?}]
 */
function parseMcpServers(): McpServerConfig[] {
  const servers = parseJsonEnv<McpServerConfig[]>(
    process.env.MCP_SERVERS,
    []
  );
  return servers.filter(s => s && s.id && s.command);
}

// ============ 配置对象 ============

const llmProviders = parseLlmProviders();
const mcpServers = parseMcpServers();

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

  // LLM 配置（与 ai-agent 共享）—— 作为默认 provider，向后兼容
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // 多 provider 配置（从 LLM_PROVIDERS 环境变量解析）
  llmProviders,

  // MCP server 配置（从 MCP_SERVERS 环境变量解析）
  mcpServers,

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
