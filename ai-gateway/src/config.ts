import dotenv from 'dotenv';
dotenv.config();

// ============ 类型定义 ============

/**
 * Thinking 方言（参考 openclaw）
 * 不同 provider 的 reasoning 控制参数形状不同，用 thinkingFormat 统一抽象：
 * - openai:            顶层 reasoning_effort: string
 * - openrouter:        reasoning: { effort: string }
 * - deepseek:          thinking: { type: "enabled"|"disabled" } + reasoning_effort
 * - together:          reasoning: { enabled: boolean } + reasoning_effort
 * - qwen:              顶层 enable_thinking: boolean
 * - qwen-chat-template: chat_template_kwargs: { enable_thinking, preserve_thinking }
 * - zai:               顶层 enable_thinking: boolean（二元 on/off）
 */
export const THINKING_FORMATS = [
  'openai',
  'openrouter',
  'deepseek',
  'together',
  'qwen',
  'qwen-chat-template',
  'zai',
] as const;
export type ThinkingFormat = (typeof THINKING_FORMATS)[number];

export function isThinkingFormat(value: string): value is ThinkingFormat {
  return (THINKING_FORMATS as readonly string[]).includes(value);
}

/**
 * 统一思考级别（参考 openclaw ThinkingLevel）
 * - off: 关闭推理
 * - low / medium / high: 推理强度
 */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/**
 * 思考级别到 provider 参数的映射
 * key 为统一级别，value 为 provider 特定参数值，null 表示显式不支持该级别
 */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

/**
 * Provider 级 compat 配置（参考 openclaw ModelCompatConfig）
 * 替代硬编码，允许运行时声明 provider 的兼容性
 */
export interface ProviderCompat {
  /** reasoning 方言，未设置时根据 baseUrl 自动检测 */
  thinkingFormat?: ThinkingFormat;
  /** 是否支持 reasoning_effort 参数（OpenAI 风格） */
  supportsReasoningEffort?: boolean;
  /** max_tokens 字段名：max_tokens | max_completion_tokens */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 是否要求消息 content 为字符串（部分 provider 不接受 null content） */
  requiresStringContent?: boolean;
}

export interface LLMModelConfig {
  id: string;
  name: string;
  /** 上下文窗口大小（token 数） */
  contextWindow?: number;
  /** 是否支持推理（reasoning）模式 */
  reasoning?: boolean;
  /** 输入类型：text / image / audio 等 */
  input?: string[];
  /** 覆盖 provider 级 compat.thinkingFormat */
  thinkingFormat?: ThinkingFormat;
  /** 各思考级别到 provider 参数的映射 */
  thinkingLevelMap?: ThinkingLevelMap;
  /** 该模型支持的思考级别列表 */
  supportedReasoningEfforts?: string[];
}

export interface LLMProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: LLMModelConfig[];
  /** provider 级 compat 配置 */
  compat?: ProviderCompat;
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

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const llmProviders = parseLlmProviders();
const mcpServers = parseMcpServers();

export const config = {
  port: parseInt(process.env.AI_GATEWAY_PORT || '3005', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // JWT（与 auth-service 共享密钥）
  jwtSecret: requireEnv('JWT_SECRET'),

  // PostgreSQL（复用 ai-agent 的数据库）
  databaseUrl: requireEnv('DATABASE_URL', 'postgres://cloudops:changeme@postgres:5432/cloudops'),

  // Redis
  redisUrl: requireEnv('REDIS_URL', 'redis://redis:6379'),

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
