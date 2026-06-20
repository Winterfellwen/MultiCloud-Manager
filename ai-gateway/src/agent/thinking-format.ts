// Thinking Format 方言处理（参考 openclaw 设计）
// 根据 thinkingFormat 将统一的 ThinkingLevel 映射为各 provider 的 wire format
//
// 设计要点：
// 1. compat 优先 + 自动检测回退（openclaw getCompat 模式）
// 2. 方言分发用清晰的 if-else 链（openclaw openai-completions.ts 模式）
// 3. ThinkingLevelMap 支持 null（显式不支持该级别）
// 4. 模型级 thinkingFormat 覆盖 provider 级 compat.thinkingFormat

import {
  type ThinkingFormat,
  type ThinkingLevel,
  type ThinkingLevelMap,
  type ProviderCompat,
  isThinkingFormat,
} from '../config.js';

/** 解析后的 thinking 配置（compat 优先，自动检测回退） */
export interface ResolvedThinkingConfig {
  thinkingFormat: ThinkingFormat;
  supportsReasoningEffort: boolean;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  supportsTools: boolean;
  requiresStringContent: boolean;
}

/**
 * 根据 provider id 和 baseUrl 自动检测 thinkingFormat（参考 openclaw detectCompat）
 * 用于 compat 未显式配置时的回退
 */
export function detectThinkingFormat(providerId: string, baseUrl: string): ThinkingFormat {
  const id = providerId.toLowerCase();
  const url = baseUrl.toLowerCase();

  if (id === 'deepseek' || url.includes('deepseek.com')) return 'deepseek';
  if (id === 'zai' || id === 'z-ai' || id === 'z.ai' || url.includes('api.z.ai')) return 'zai';
  if (id === 'together' || url.includes('api.together.ai')) return 'together';
  if (id === 'openrouter' || url.includes('openrouter.ai')) return 'openrouter';
  if (id === 'qwen' || id === 'dashscope' || id === 'modelstudio' || url.includes('dashscope.aliyuncs.com')) {
    return 'qwen';
  }
  // 默认 OpenAI 风格
  return 'openai';
}

/**
 * 解析 thinking 配置：compat 优先，未设置的字段用自动检测回退（参考 openclaw getCompat）
 */
export function resolveThinkingConfig(
  providerId: string,
  baseUrl: string,
  compat?: ProviderCompat,
  modelThinkingFormat?: ThinkingFormat,
): ResolvedThinkingConfig {
  const detectedFormat = detectThinkingFormat(providerId, baseUrl);
  // 模型级 thinkingFormat > provider compat.thinkingFormat > 自动检测
  const thinkingFormat = modelThinkingFormat ?? compat?.thinkingFormat ?? detectedFormat;

  // 默认值：OpenAI 兼容
  const defaults: ResolvedThinkingConfig = {
    thinkingFormat,
    supportsReasoningEffort: thinkingFormat === 'openai' || thinkingFormat === 'deepseek' || thinkingFormat === 'together' || thinkingFormat === 'openrouter',
    maxTokensField: 'max_tokens',
    supportsTools: true,
    requiresStringContent: false,
  };

  if (!compat) return defaults;

  return {
    thinkingFormat,
    supportsReasoningEffort: compat.supportsReasoningEffort ?? defaults.supportsReasoningEffort,
    maxTokensField: compat.maxTokensField ?? defaults.maxTokensField,
    supportsTools: compat.supportsTools ?? defaults.supportsTools,
    requiresStringContent: compat.requiresStringContent ?? defaults.requiresStringContent,
  };
}

/**
 * 将统一 ThinkingLevel 映射为 provider 特定参数值
 * 参考 openclaw: model.thinkingLevelMap?.[level] ?? level
 * null 表示显式不支持该级别
 */
export function mapThinkingLevel(
  level: ThinkingLevel,
  levelMap?: ThinkingLevelMap,
): string | null {
  if (!levelMap) return level; // 无映射表，直接返回统一级别
  const mapped = levelMap[level];
  if (mapped === null) return null; // 显式不支持
  return mapped ?? level; // 未配置则回退到统一级别
}

export interface ThinkingPayloadOptions {
  /** 是否启用思考（false=off） */
  enableThinking: boolean;
  /** 思考级别（enableThinking=true 时生效） */
  reasoningEffort?: ThinkingLevel;
  /** 模型级 thinkingLevelMap */
  thinkingLevelMap?: ThinkingLevelMap;
}

/**
 * 根据 thinkingFormat 构建请求 payload 中的 thinking 相关字段
 * 参考 openclaw openai-completions.ts 的方言分发逻辑
 *
 * 返回的对象会被 merge 到 requestBody 中
 */
export function buildThinkingPayload(
  thinkingConfig: ResolvedThinkingConfig,
  modelReasoning: boolean,
  options: ThinkingPayloadOptions,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!modelReasoning) return params; // 模型不支持 reasoning，不发送任何 thinking 参数

  const { thinkingFormat, supportsReasoningEffort } = thinkingConfig;
  const { enableThinking, reasoningEffort, thinkingLevelMap } = options;

  switch (thinkingFormat) {
    case 'zai':
    case 'qwen': {
      // 顶层 enable_thinking: boolean（二元 on/off）
      params.enable_thinking = enableThinking;
      break;
    }
    case 'qwen-chat-template': {
      // chat_template_kwargs: { enable_thinking, preserve_thinking }
      params.chat_template_kwargs = {
        enable_thinking: enableThinking,
        preserve_thinking: true,
      };
      break;
    }
    case 'deepseek': {
      // thinking: { type: "enabled"|"disabled" } + reasoning_effort
      params.thinking = { type: enableThinking ? 'enabled' : 'disabled' };
      if (enableThinking && reasoningEffort && supportsReasoningEffort) {
        const mapped = mapThinkingLevel(reasoningEffort, thinkingLevelMap);
        if (mapped !== null) params.reasoning_effort = mapped;
      }
      break;
    }
    case 'openrouter': {
      // reasoning: { effort: string }
      if (enableThinking && reasoningEffort) {
        const mapped = mapThinkingLevel(reasoningEffort, thinkingLevelMap);
        if (mapped !== null) {
          params.reasoning = { effort: mapped };
        }
      } else if (!enableThinking) {
        params.reasoning = { effort: 'none' };
      }
      break;
    }
    case 'together': {
      // reasoning: { enabled: boolean } + 可选 reasoning_effort
      params.reasoning = { enabled: enableThinking };
      if (enableThinking && reasoningEffort && supportsReasoningEffort) {
        const mapped = mapThinkingLevel(reasoningEffort, thinkingLevelMap);
        if (mapped !== null) params.reasoning_effort = mapped;
      }
      break;
    }
    case 'openai':
    default: {
      // OpenAI 风格：顶层 reasoning_effort: string
      if (enableThinking && reasoningEffort && supportsReasoningEffort) {
        const mapped = mapThinkingLevel(reasoningEffort, thinkingLevelMap);
        if (mapped !== null) params.reasoning_effort = mapped;
      }
      break;
    }
  }

  return params;
}

/**
 * 从 LLM 响应中提取推理内容
 * 不同 provider 返回 reasoning 的方式不同：
 * - reasoning_content 字段（DeepSeek/Qwen 风格）
 * - <think>...</think> 标签（部分 vLLM 模型）
 */
export function extractReasoning(message: {
  reasoning_content?: string;
  content?: string | null;
}): { reasoning?: string; text: string } {
  let reasoning: string | undefined;
  let text = message.content || '';

  if (message.reasoning_content) {
    reasoning = message.reasoning_content;
  } else if (typeof text === 'string') {
    // 检查 <think>...</think> 标签
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      reasoning = thinkMatch[1].trim();
    }
  }

  // 去除正文中的 <think> 标签部分
  if (reasoning && typeof text === 'string' && text.includes('<think>')) {
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  return { reasoning, text };
}

/**
 * 规范化 compat 输入（从 JSON/未知类型安全解析）
 */
export function normalizeCompat(value: unknown): ProviderCompat | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const compat: ProviderCompat = {};

  if (typeof raw.thinkingFormat === 'string' && isThinkingFormat(raw.thinkingFormat)) {
    compat.thinkingFormat = raw.thinkingFormat;
  }
  if (typeof raw.supportsReasoningEffort === 'boolean') {
    compat.supportsReasoningEffort = raw.supportsReasoningEffort;
  }
  if (raw.maxTokensField === 'max_tokens' || raw.maxTokensField === 'max_completion_tokens') {
    compat.maxTokensField = raw.maxTokensField;
  }
  if (typeof raw.supportsTools === 'boolean') {
    compat.supportsTools = raw.supportsTools;
  }
  if (typeof raw.requiresStringContent === 'boolean') {
    compat.requiresStringContent = raw.requiresStringContent;
  }

  return Object.keys(compat).length > 0 ? compat : undefined;
}

/**
 * 规范化 thinkingLevelMap 输入
 */
export function normalizeThinkingLevelMap(value: unknown): ThinkingLevelMap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const map: ThinkingLevelMap = {};
  const validLevels: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];

  for (const level of validLevels) {
    if (level in raw) {
      const v = raw[level];
      if (v === null) {
        map[level] = null;
      } else if (typeof v === 'string') {
        map[level] = v;
      }
    }
  }

  return Object.keys(map).length > 0 ? map : undefined;
}
