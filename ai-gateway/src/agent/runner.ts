// Agent Runner（复用 ai-agent 的 LLM 调用逻辑，适配事件回调）
// 调用 LLM + 执行工具 + 推送事件
//
// 扩展能力：
// - 支持 model 覆盖（provider/model 格式，选择对应 provider 的 baseUrl/apiKey）
// - 支持图片附件（多模态 messages）
// - 支持 temperature / maxTokens 覆盖
// - dangerous 级别工具调用前请求审批

import { config, type ThinkingLevel } from '../config.js';
import { executeTool, getLLMToolsForMode, findTool, type ToolCall, type ModeType } from './tools.js';
import {
  requestApproval,
  type ExecApprovalContext,
} from '../methods/exec-approval.js';
import { readReplay, type AcpEvent } from '../acp/event-ledger.js';
import { getProviderFromStore, listProvidersFromStore } from '../acp/provider-store.js';
import {
  resolveThinkingConfig,
  buildThinkingPayload,
  extractReasoning,
  type ResolvedThinkingConfig,
} from './thinking-format.js';

// ============ 类型定义 ============

/** 附件（支持图片等多模态输入） */
export interface Attachment {
  /** 附件类型：image / file 等 */
  type: string;
  /** MIME 类型，如 image/png */
  mimeType: string;
  /** 文件名（可选） */
  fileName?: string;
  /** 内容（base64 编码，不含 data: 前缀） */
  content: string;
}

export interface AgentTurnCallbacks {
  onDelta: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (result: { name: string; success: boolean; data: unknown; error?: string; toolCallId?: string }) => void;
  onComplete: (finalText: string) => void;
}

export interface AgentTurnParams {
  sessionKey: string;
  runId: string;
  userMessage: string;
  signal: AbortSignal;
  authToken?: string;
  /** 模型覆盖（支持 "provider/model" 格式） */
  model?: string;
  /** 附件列表（图片附件会以多模态格式发送） */
  attachments?: Attachment[];
  /** 温度覆盖 */
  temperature?: number;
  /** 最大 token 覆盖 */
  maxTokens?: number;
  /** 审批上下文（用于 dangerous 工具审批，不传则跳过审批） */
  approvalContext?: ExecApprovalContext;
  /** 是否启用深度思考（reasoning）模式，默认 true */
  enableThinking?: boolean;
  /** 推理努力程度：off / low / medium / high（仅 enableThinking=true 时生效） */
  reasoningEffort?: ThinkingLevel;
  /** 当前模式：plan/action/confirm */
  mode?: ModeType;
}

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助用户通过自然语言管理多云资源。

你可以：
- 查询、创建、启停、重启、删除云服务器实例
- 查询、删除各类云资源（磁盘、数据库、缓存、VPC、安全组、CDN、集群等）
- 触发云资源同步
- 查询监控指标和告警事件
- 查询多云成本分析
- 执行Shell命令（仅Action/Confirm模式，Plan模式不可用）

支持的云厂商：aws | aliyun | azure | tencent | huawei

可用工具：
- cloud_list_instances: 列出云实例（可按厂商、区域、状态筛选）
- cloud_get_instance: 查看实例详情
- cloud_start_instance: 启动实例
- cloud_stop_instance: 停止实例
- cloud_reboot_instance: 重启实例
- cloud_create_instance: 创建实例（需指定厂商、区域、规格、镜像）
- cloud_delete_instance: 删除实例
- cloud_list_resources: 列出云资源（支持 disk/bucket/database/cache/loadbalancer/vpc/securitygroup/cdn/cluster/aiservice）
- cloud_get_resource: 查看资源详情
- cloud_delete_resource: 删除资源
- cloud_sync_resources: 触发资源同步
- monitor_get_metrics: 查询监控指标
- monitor_list_alerts: 列出告警事件
- monitor_get_cost: 查询成本
- shell_execute: 执行Shell命令（Plan模式不可用）

请用中文回复，简洁专业。`;

/**
 * 执行 Agent turn（调用 LLM + 工具循环）
 */
export async function runAgentTurn(
  params: AgentTurnParams,
  callbacks: AgentTurnCallbacks
): Promise<void> {
  // 构造初始 messages（支持多模态附件）
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // 加载历史对话上下文（从 ACP 事件账本重建）
  // 注意：chat.ts 在调用 runAgentTurn 之前已 await recordEvent 记录了当前用户消息，
  // 所以 rebuildMessagesFromHistory 返回的历史已包含当前用户消息，无需再手动添加。
  const historyMessages = await rebuildMessagesFromHistory(params.sessionKey);
  messages.push(...historyMessages);

  // 如果有附件，将最后一条 user 消息替换为多模态格式（历史中只存了纯文本）
  if (params.attachments && params.attachments.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.content = buildUserContent(params.userMessage, params.attachments);
    }
  }

  // 解析 model 覆盖配置
  const llmConfig = await resolveLlmConfig(params.model);

  let finalText = '';
  let iterations = 0;

  // 动态获取 LLM 工具列表（根据模式过滤）
  const tools = getLLMToolsForMode(params.mode);

  while (iterations < config.agent.maxIterations) {
    iterations++;

    if (params.signal.aborted) {
      throw new Error('Run aborted');
    }

    // 调用 LLM
    const response = await callLLM(messages, params.signal, {
      llmConfig,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      tools,
      enableThinking: params.enableThinking ?? true, // 默认启用深度思考
      reasoningEffort: params.reasoningEffort,
    });

    if (response.reasoning) {
      // 推理过程通过独立通道推送（前端可折叠显示）
      callbacks.onReasoning(response.reasoning);
    }

    if (response.text) {
      finalText += response.text;
      callbacks.onDelta(response.text);
    }

    if (response.toolCalls.length === 0) {
      break;
    }

    // 添加 assistant 消息
    messages.push({
      role: 'assistant',
      content: response.text || null,
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    // 执行工具
    for (const toolCall of response.toolCalls) {
      callbacks.onToolCall(toolCall);

      // dangerous 级别工具需要审批
      const toolDef = findTool(toolCall.name);
      if (toolDef && toolDef.dangerLevel === 'dangerous' && params.approvalContext) {
        const approved = await requestApproval({
          runId: params.runId,
          sessionKey: params.sessionKey,
          toolCall,
          toolName: toolCall.name,
          dangerLevel: toolDef.dangerLevel,
          context: params.approvalContext,
          signal: params.signal,
        }).catch(() => false); // 中止时视为拒绝

        if (!approved) {
          const rejectMsg = `工具 ${toolCall.name} 的审批被拒绝，跳过执行`;
          const result = { name: toolCall.name, success: false, data: null, error: rejectMsg, toolCallId: toolCall.id };
          callbacks.onToolResult(result);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
          continue;
        }
      }

      const result = await executeTool(toolCall, params.authToken || '', params.mode);
      callbacks.onToolResult({ ...result, toolCallId: toolCall.id });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.data),
      });
    }
  }

  callbacks.onComplete(finalText);
}

// ============ 辅助函数 ============

/**
 * 从 ACP 事件账本重建历史 messages
 * 将 user_message / assistant_delta / assistant_complete / tool_call / tool_result
 * 事件转换为 OpenAI chat completions 格式的 messages 数组
 *
 * 注意：chat.ts 在调用 runAgentTurn 之前已 await recordEvent 记录了当前用户消息，
 * 所以这里读取的历史已包含当前用户消息，调用方无需再手动添加。
 */
async function rebuildMessagesFromHistory(sessionKey: string): Promise<Array<Record<string, unknown>>> {
  let events: AcpEvent[];
  try {
    events = await readReplay(sessionKey, 0);
  } catch {
    return [];
  }

  if (events.length === 0) return [];

  const messages: Array<Record<string, unknown>> = [];
  // 按 runId 分组 assistant 消息，合并 delta
  const runIdToAssistant = new Map<string, { text: string; toolCalls: Array<{ id: string; name: string; arguments: string }>; flushed: boolean }>();
  // 记录已 complete 的 runId，避免 assistant_complete 之后的 assistant_delta 重复追加
  const completedRuns = new Set<string>();

  for (const evt of events) {
    const payload = evt.payload as Record<string, unknown>;
    const runId = payload.runId as string | undefined;

    switch (evt.type) {
      case 'user_message': {
        const message = payload.message as string;
        messages.push({ role: 'user', content: message });
        break;
      }
      case 'assistant_delta': {
        if (!runId) break;
        // 如果该 run 已经 complete（finalText 已设置），忽略后续的 delta 事件
        if (completedRuns.has(runId)) break;
        let entry = runIdToAssistant.get(runId);
        if (!entry) {
          entry = { text: '', toolCalls: [], flushed: false };
          runIdToAssistant.set(runId, entry);
        }
        entry.text += (payload.delta as string) || '';
        break;
      }
      case 'assistant_complete': {
        if (!runId) break;
        completedRuns.add(runId);
        let entry = runIdToAssistant.get(runId);
        if (!entry) {
          entry = { text: '', toolCalls: [], flushed: false };
          runIdToAssistant.set(runId, entry);
        }
        // 只在未被 tool_result flush 过时用 finalText 覆盖
        // 多迭代 run 中，早期迭代的文本已由 tool_result flush 为独立消息，
        // finalText 是全量累加文本，覆盖会导致早期文本重复
        if (!entry.flushed) {
          const finalText = payload.finalText as string | undefined;
          if (finalText) entry.text = finalText;
        }
        break;
      }
      case 'tool_call': {
        if (!runId) break;
        let entry = runIdToAssistant.get(runId);
        if (!entry) {
          entry = { text: '', toolCalls: [], flushed: false };
          runIdToAssistant.set(runId, entry);
        }
        const toolCall = payload.toolCall as { id: string; name: string; args?: unknown; arguments?: unknown } | undefined;
        if (toolCall) {
          entry.toolCalls.push({
            id: toolCall.id,
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args ?? toolCall.arguments ?? {}),
          });
        }
        break;
      }
      case 'tool_result': {
        // tool_result 事件：先 flush 对应 runId 的 assistant 消息（含 tool_calls），再添加 tool 消息
        if (!runId) break;
        const entry = runIdToAssistant.get(runId);
        // 只有当 entry 有内容时才 push assistant 消息（避免多余的空消息）
        if (entry && (entry.text || entry.toolCalls.length > 0)) {
          messages.push({
            role: 'assistant',
            content: entry.text || null,
            tool_calls: entry.toolCalls.length > 0
              ? entry.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
              : undefined,
          });
          // 清空已 push 的内容，避免重复
          entry.text = '';
          entry.toolCalls = [];
          entry.flushed = true;
        }
        const result = payload.result as { name?: string; success?: boolean; data?: unknown; error?: string } | undefined;
        // 优先使用事件中的 toolCallId 精确匹配
        const explicitToolCallId = payload.toolCallId as string | undefined;
        let toolCallIdToUse = explicitToolCallId;
        if (!toolCallIdToUse) {
          // 回退：从最近 push 的 assistant 消息中取最后一个 tool_call_id
          const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
          toolCallIdToUse = (lastAssistant?.tool_calls as Array<{ id: string }> | undefined)?.slice(-1)[0]?.id;
        }
        if (toolCallIdToUse) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCallIdToUse,
            content: JSON.stringify(result?.data ?? result?.error ?? result ?? {}),
          });
        }
        break;
      }
      case 'error': {
        // 错误事件不重建到 messages 中
        break;
      }
    }
  }

  // 处理最后一个未 flush 的 assistant 消息（没有 tool_result 的情况）
  for (const [, entry] of runIdToAssistant) {
    if (entry.text || entry.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: entry.text || null,
        tool_calls: entry.toolCalls.length > 0
          ? entry.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
          : undefined,
      });
    }
  }

  // 上下文窗口管理：限制历史消息数量，防止超出 LLM 上下文窗口
  // 保留最近的消息，确保截断后不产生孤立的 tool 消息（tool 消息必须跟在带 tool_calls 的 assistant 消息之后）
  const MAX_HISTORY_MESSAGES = 40;
  if (messages.length > MAX_HISTORY_MESSAGES) {
    let truncated = messages.slice(-MAX_HISTORY_MESSAGES);
    // 跳过开头的 tool 消息（没有前置 assistant tool_calls 的孤立 tool 消息）
    while (truncated.length > 0 && truncated[0].role === 'tool') {
      truncated = truncated.slice(1);
    }
    // 跳过开头的没有 tool_calls 的 assistant 消息（如果它原本有 tool_calls 但被截断了）
    while (truncated.length > 0 && truncated[0].role === 'assistant' && !truncated[0].tool_calls) {
      truncated = truncated.slice(1);
    }
    return truncated;
  }

  return messages;
}

/**
 * 构造 user 消息内容
 * - 无附件：返回纯文本
 * - 有图片附件：返回多模态格式数组
 */
function buildUserContent(
  userMessage: string,
  attachments?: Attachment[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (!attachments || attachments.length === 0) {
    return userMessage;
  }

  // 筛选图片附件
  const imageAttachments = attachments.filter(a => a.type === 'image');
  if (imageAttachments.length === 0) {
    return userMessage;
  }

  // 多模态格式：文本 + 图片
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: userMessage },
  ];
  for (const img of imageAttachments) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.content}` },
    });
  }
  return content;
}

/** 解析后的 LLM 调用配置 */
interface ResolvedLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 模型是否支持 reasoning */
  modelReasoning: boolean;
  /** 解析后的 thinking 配置（compat 优先 + 自动检测回退） */
  thinkingConfig: ResolvedThinkingConfig;
  /** 模型级 thinkingLevelMap */
  thinkingLevelMap?: import('../config.js').ThinkingLevelMap;
}

/**
 * 解析 model 覆盖配置
 * - model 为空：使用默认 provider（store 中 is_default=1 的，或 config.llm）
 * - model 为 "provider/model" 格式：从 provider store 查找对应 provider
 * - model 为 "default/model-name" 格式：使用默认 provider，提取真实模型名
 * - model 为纯模型名：使用默认 provider，覆盖 model 名
 *
 * 同时解析 thinking 配置（参考 openclaw getCompat 模式）：
 * 模型级 thinkingFormat > provider compat.thinkingFormat > 基于 baseUrl 自动检测
 */
async function resolveLlmConfig(modelOverride?: string): Promise<ResolvedLlmConfig> {
  // 获取默认 provider（优先从 store 读取）
  const storeProviders = await listProvidersFromStore();
  const defaultProvider = storeProviders.find(p => (p as any).isDefault) || storeProviders[0];

  // 构建基础配置（含 thinking 解析）
  const buildConfig = (
    baseUrl: string,
    apiKey: string,
    modelId: string,
    providerId: string,
    compat?: import('../config.js').ProviderCompat,
    model?: import('../config.js').LLMModelConfig,
  ): ResolvedLlmConfig => {
    const thinkingConfig = resolveThinkingConfig(
      providerId,
      baseUrl,
      compat,
      model?.thinkingFormat,
    );
    return {
      baseUrl,
      apiKey,
      model: modelId,
      modelReasoning: model?.reasoning ?? false,
      thinkingConfig,
      thinkingLevelMap: model?.thinkingLevelMap,
    };
  };

  if (defaultProvider) {
    const defaultModel = defaultProvider.models[0];
    const defaultConfig = buildConfig(
      defaultProvider.baseUrl,
      defaultProvider.apiKey,
      defaultModel?.id || config.llm.model,
      defaultProvider.id,
      defaultProvider.compat,
      defaultModel,
    );

    if (!modelOverride) return defaultConfig;

    // 检查是否为 "provider/model" 格式
    const slashIndex = modelOverride.indexOf('/');
    if (slashIndex > 0) {
      const providerId = modelOverride.slice(0, slashIndex);
      const modelName = modelOverride.slice(slashIndex + 1);

      // 特殊处理 "default/" 前缀：使用默认 provider 配置，只覆盖 model 名
      if (providerId === 'default') {
        // 在默认 provider 中查找对应模型
        const matchedModel = defaultProvider.models.find(m => m.id === modelName);
        return buildConfig(
          defaultProvider.baseUrl,
          defaultProvider.apiKey,
          modelName,
          defaultProvider.id,
          defaultProvider.compat,
          matchedModel,
        );
      }

      // 从 provider store 查找
      const provider = await getProviderFromStore(providerId);
      if (provider) {
        const matchedModel = provider.models.find(m => m.id === modelName);
        return buildConfig(
          provider.baseUrl,
          provider.apiKey,
          modelName,
          provider.id,
          provider.compat,
          matchedModel,
        );
      }

      // 回退到 config.llmProviders
      const configProvider = config.llmProviders.find(p => p.id === providerId);
      if (configProvider) {
        const matchedModel = configProvider.models.find(m => m.id === modelName);
        return buildConfig(
          configProvider.baseUrl,
          configProvider.apiKey,
          modelName,
          configProvider.id,
          configProvider.compat,
          matchedModel,
        );
      }
    }

    // 纯模型名：使用默认 provider，覆盖 model
    // 尝试在默认 provider 中匹配模型以获取 reasoning 配置
    const matchedModel = defaultProvider.models.find(m => m.id === modelOverride);
    return buildConfig(
      defaultProvider.baseUrl,
      defaultProvider.apiKey,
      modelOverride,
      defaultProvider.id,
      defaultProvider.compat,
      matchedModel,
    );
  }

  // 无 store provider，回退到 config.llm
  const fallbackConfig = buildConfig(
    config.llm.baseUrl,
    config.llm.apiKey,
    config.llm.model,
    'default',
    undefined,
    undefined,
  );
  if (!modelOverride) return fallbackConfig;

  const slashIndex = modelOverride.indexOf('/');
  if (slashIndex > 0) {
    const providerId = modelOverride.slice(0, slashIndex);
    const modelName = modelOverride.slice(slashIndex + 1);
    const configProvider = config.llmProviders.find(p => p.id === providerId);
    if (configProvider) {
      const matchedModel = configProvider.models.find(m => m.id === modelName);
      return buildConfig(
        configProvider.baseUrl,
        configProvider.apiKey,
        modelName,
        configProvider.id,
        configProvider.compat,
        matchedModel,
      );
    }
  }

  return { ...fallbackConfig, model: modelOverride };
}

interface LLMResponse {
  text: string;
  toolCalls: Array<ToolCall & { id: string }>;
  /** 推理过程内容（深度思考模式） */
  reasoning?: string;
}

interface CallLlmOptions {
  llmConfig: ResolvedLlmConfig;
  temperature?: number;
  maxTokens?: number;
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  /** 是否启用深度思考模式 */
  enableThinking?: boolean;
  /** 推理努力程度：off / low / medium / high */
  reasoningEffort?: ThinkingLevel;
}

async function callLLM(
  messages: Array<Record<string, unknown>>,
  signal: AbortSignal,
  options: CallLlmOptions
): Promise<LLMResponse> {
  const { llmConfig, temperature, maxTokens, tools, enableThinking, reasoningEffort } = options;
  const { thinkingConfig, modelReasoning, thinkingLevelMap } = llmConfig;

  // 构建请求体（参考 openclaw 方言分发）
  const maxTokensField = thinkingConfig.maxTokensField;
  const requestBody: Record<string, unknown> = {
    model: llmConfig.model,
    messages,
    temperature: temperature ?? config.llm.temperature,
    [maxTokensField]: maxTokens ?? config.llm.maxTokens,
  };

  // 仅当 provider 支持工具时才发送 tools 字段
  if (thinkingConfig.supportsTools) {
    requestBody.tools = tools;
  }

  // 根据 thinkingFormat 方言构建 thinking 相关参数（替代硬编码 chat_template_kwargs）
  const thinkingPayload = buildThinkingPayload(thinkingConfig, modelReasoning, {
    enableThinking: enableThinking ?? true,
    reasoningEffort,
    thinkingLevelMap,
  });
  Object.assign(requestBody, thinkingPayload);

  // requiresStringContent: 部分 provider 不接受 null content，转为空字符串
  if (thinkingConfig.requiresStringContent) {
    for (const msg of messages) {
      if (msg.content === null) msg.content = '';
    }
  }

  // 重试机制：最多重试3次，指数退避
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      // 处理可重试的 HTTP 错误
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        const retryAfter = res.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        const errText = await res.text().catch(() => '');
        console.log(`LLM API error ${res.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}): ${errText.slice(0, 200)}`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM API error ${res.status}: ${errText}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      const message = choice?.message || {};

      // 提取推理内容（统一处理 reasoning_content 字段和 <think> 标签）
      const { reasoning, text } = extractReasoning(message);

      const toolCalls: Array<ToolCall & { id: string }> = (message.tool_calls || []).map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }));

      return { text, toolCalls, reasoning };
    } catch (err) {
      lastError = err as Error;
      const errorMsg = (err as Error).message || '';
      
      // 如果是可重试的错误且还有重试次数，继续重试
      const isRetryable = (
        errorMsg.includes('429') ||
        errorMsg.includes('500') ||
        errorMsg.includes('502') ||
        errorMsg.includes('503') ||
        errorMsg.includes('504') ||
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('timeout')
      );
      
      if (isRetryable && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`LLM API retryable error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMsg.slice(0, 200)}`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      
      // 其他错误或重试次数用尽
      throw err;
    }
  }
  
  // 所有重试都失败
  throw lastError || new Error('LLM API request failed after all retries');
}
