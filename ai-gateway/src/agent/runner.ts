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

const SYSTEM_PROMPT_BASE = `你是 CloudOps AI 运维助手，帮助用户通过自然语言管理多云资源。

支持的云厂商：aws | aliyun | azure | tencent | huawei

请用中文回复，简洁专业。`;

function getSystemPrompt(mode?: ModeType): string {
  const modeInstructions: Record<ModeType, string> = {
    plan: `当前模式：Plan（只读模式）

可用工具（仅查询类）：
- cloud_list_instances: 列出云实例（可按厂商、区域、状态筛选）
- cloud_get_instance: 查看实例详情
- cloud_list_resources: 列出云资源（支持 disk/bucket/database/cache/loadbalancer/vpc/securitygroup/cdn/cluster/aiservice）
- cloud_get_resource: 查看资源详情
- cloud_service_call: 调用 cloud-service API（路径以 /cloud/ 或 /monitor/ 开头）
- monitor_get_metrics: 查询监控指标
- monitor_list_alerts: 列出告警事件
- monitor_get_cost: 查询成本

不可用工具（Plan模式下禁止调用）：
- cloud_start_instance / cloud_stop_instance / cloud_reboot_instance（启停操作）
- cloud_create_instance / cloud_delete_instance（创建删除实例）
- cloud_delete_resource（删除资源）
- cloud_sync_resources（触发同步）
- shell_execute（执行Shell命令）

当用户要求执行修改性操作时，请告知用户当前处于Plan只读模式，建议切换到Action或Confirm模式后再执行，并给出操作计划建议。`,
    action: `当前模式：Action（自动执行模式）

所有工具可用，修改性操作将自动执行（无需审批）：
- cloud_list_instances / cloud_get_instance: 查询实例
- cloud_start_instance / cloud_stop_instance / cloud_reboot_instance: 启停操作
- cloud_create_instance / cloud_delete_instance: 创建删除实例
- cloud_list_resources / cloud_get_resource: 查询资源
- cloud_delete_resource: 删除资源
- cloud_sync_resources: 触发同步
- cloud_service_call: 调用 cloud-service API（通用接口）
- monitor_get_metrics / monitor_list_alerts / monitor_get_cost: 监控
- shell_execute: 执行Shell命令（仅限非云操作）

工具使用优先级（必须遵守）：
1. 优先使用 cloud_xxx_* 专用工具（如 cloud_delete_resource）。
2. 如果专用工具不支持某操作，使用 cloud_service_call 调用 cloud-service API。
3. 只有在所有 API 方案都失败后，才考虑使用 shell_execute。
4. shell_execute 仅用于执行非云相关的系统命令（如 ls, cat, grep, find 等）。
5. 禁止在 shell 中执行任何云 CLI 命令（az, aws, aliyun, kubectl, docker 等）。
6. 禁止在 shell 中读取任何环境变量（env, printenv, echo $XXX）。

重要规则：
1. Action模式下所有操作自动执行，请确认用户意图后再调用危险工具。
2. 工具调用失败时的处理策略：
   - 分析错误消息，理解失败原因。
   - 如果是资源嵌套、权限、API限制等服务端错误，直接重试相同工具调用即可——后端会自动处理嵌套资源清理。
   - 如果重试仍然失败，尝试使用 cloud_service_call 调用其他 API 路径。
   - 只有在所有 API 方案都失败后，才向用户报告。
3. 每次工具调用后，如果返回错误，必须主动分析并尝试替代方案，不要直接放弃。`,
    confirm: `当前模式：Confirm（确认模式）

所有工具可用，修改性操作需要用户逐次审批确认后才会执行：
- cloud_list_instances / cloud_get_instance: 查询实例
- cloud_start_instance / cloud_stop_instance / cloud_reboot_instance: 启停操作
- cloud_create_instance / cloud_delete_instance: 创建删除实例
- cloud_list_resources / cloud_get_resource: 查询资源
- cloud_delete_resource: 删除资源
- cloud_sync_resources: 触发同步
- cloud_service_call: 调用 cloud-service API（通用接口）
- monitor_get_metrics / monitor_list_alerts / monitor_get_cost: 监控
- shell_execute: 执行Shell命令（仅限非云操作）

工具使用优先级（必须遵守）：
1. 优先使用 cloud_xxx_* 专用工具。
2. 如果专用工具不支持某操作，使用 cloud_service_call 调用 cloud-service API。
3. shell_execute 仅用于非云相关的系统命令。
4. 禁止在 shell 中执行云 CLI 命令或读取环境变量。

重要规则：
1. 用户确认后工具才会执行，可以正常调用所有工具。
2. 工具调用失败时的处理策略：
   - 分析错误消息，理解失败原因。
   - 如果是资源嵌套、权限、API限制等服务端错误，直接重试相同工具调用即可——后端会自动处理嵌套资源清理。
   - 如果重试仍然失败，尝试使用 cloud_service_call 调用其他 API 路径。
   - 只有在所有 API 方案都失败后，才向用户报告。
3. 每次工具调用后，如果返回错误，必须主动分析并尝试替代方案，不要直接放弃。`,
  };

  return `${SYSTEM_PROMPT_BASE}\n\n${modeInstructions[mode || 'plan']}`;
}

/**
 * 执行 Agent turn（调用 LLM + 工具循环）
 */
export async function runAgentTurn(
  params: AgentTurnParams,
  callbacks: AgentTurnCallbacks
): Promise<void> {
  // 构造初始 messages（支持多模态附件）
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: getSystemPrompt(params.mode) },
  ];

  // 加载历史对话上下文（从 ACP 事件账本重建）
  // 注意：chat.ts 在调用 runAgentTurn 之前已 await recordEvent 记录了当前用户消息，
  // 所以 rebuildMessagesFromHistory 返回的历史已包含当前用户消息，无需再手动添加。
  const historyMessages = await rebuildMessagesFromHistory(params.sessionKey);

  // 模式切换提醒：在当前用户消息之前注入模式提示，避免 LLM 被旧历史中的模式信息误导
  const modeLabels: Record<ModeType, string> = {
    plan: 'Plan（只读模式）',
    action: 'Action（自动执行模式）',
    confirm: 'Confirm（确认模式）',
  };
  const currentModeLabel = modeLabels[params.mode || 'plan'];
  const modeReminder = {
    role: 'system',
    content: `[系统提醒] 当前对话模式为 ${currentModeLabel}。请严格按照当前模式的规则行事，忽略历史中可能存在的旧模式信息。`,
  };

  // 在最后一条 user 消息之前插入模式提醒
  if (historyMessages.length > 0) {
    // 找到最后一条 user 消息的位置，在其之前插入
    let lastUserIdx = -1;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      if (historyMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0) {
      historyMessages.splice(lastUserIdx, 0, modeReminder);
    } else {
      // 没有 user 消息，直接追加
      historyMessages.push(modeReminder);
    }
  } else {
    historyMessages.push(modeReminder);
  }

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

      const toolDef = findTool(toolCall.name);

      // Plan 模式下立即拒绝非只读工具（不触发审批弹窗）
      if (params.mode === 'plan' && toolDef && toolDef.dangerLevel !== 'safe') {
        const rejectMsg = `${toolDef.label || toolCall.name} 在 Plan 模式下不可用，请切换到 Action 或 Confirm 模式`;
        const result = { name: toolCall.name, success: false, data: null, error: rejectMsg, toolCallId: toolCall.id };
        callbacks.onToolResult(result);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
        continue;
      }

      // dangerous 级别工具需要审批（仅 Confirm 模式）
      if (toolDef && toolDef.dangerLevel === 'dangerous' && params.mode === 'confirm' && params.approvalContext) {
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

  // 如果 LLM 只返回了 reasoning 但没有 text，且没有 tool calls，补充一条提示
  if (!finalText) {
    callbacks.onComplete('（AI 完成了思考，但未生成文字回复。请根据上方的思考内容查看分析结果，或尝试重新提问。）');
    return;
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
          // 立即 flush assistant 消息到 messages 数组（确保 assistant 消息在下一个 user 消息之前）
          const hasToolCalls = entry.toolCalls.length > 0;
          const hasText = entry.text && entry.text.trim().length > 0;
          if (hasToolCalls || hasText) {
            messages.push({
              role: 'assistant',
              content: entry.text || null,
              tool_calls: hasToolCalls
                ? entry.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
                : undefined,
            });
            // 清空已 push 的内容，避免重复
            entry.text = '';
            entry.toolCalls = [];
            entry.flushed = true;
          }
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
        // 跳过空文本且无 tool_calls 的 assistant 消息
        if (entry) {
          const hasToolCalls = entry.toolCalls.length > 0;
          const hasText = entry.text && entry.text.trim().length > 0;
          if (hasToolCalls || hasText) {
            messages.push({
              role: 'assistant',
              content: entry.text || null,
              tool_calls: hasToolCalls
                ? entry.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
                : undefined,
            });
          }
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
  // 跳过空文本且无 tool_calls 的 assistant 消息（避免发送到 API 时触发 add_generation_prompt 错误）
  for (const [, entry] of runIdToAssistant) {
    const hasToolCalls = entry.toolCalls.length > 0;
    const hasText = entry.text && entry.text.trim().length > 0;
    if (hasToolCalls || hasText) {
      messages.push({
        role: 'assistant',
        content: entry.text || null,
        tool_calls: hasToolCalls
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
        console.error(`[callLLM] API error ${res.status}: ${errText.slice(0, 500)}`);
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
