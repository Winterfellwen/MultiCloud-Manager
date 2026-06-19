// Agent Runner（复用 ai-agent 的 LLM 调用逻辑，适配事件回调）
// 调用 LLM + 执行工具 + 推送事件
//
// 扩展能力：
// - 支持 model 覆盖（provider/model 格式，选择对应 provider 的 baseUrl/apiKey）
// - 支持图片附件（多模态 messages）
// - 支持 temperature / maxTokens 覆盖
// - dangerous 级别工具调用前请求审批

import { config } from '../config.js';
import { executeTool, getLLMTools, findTool, type ToolCall } from './tools.js';
import {
  requestApproval,
  type ExecApprovalContext,
} from '../methods/exec-approval.js';

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
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (result: { name: string; success: boolean; data: unknown }) => void;
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
}

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助用户通过自然语言管理多云资源。

你可以：
- 查询、创建、启停、重启、删除云服务器实例
- 查询监控指标和告警事件
- 查询多云成本分析

可用工具：
- cloud_list_instances: 列出云实例
- cloud_get_instance: 查看实例详情
- cloud_start_instance: 启动实例
- cloud_stop_instance: 停止实例
- cloud_reboot_instance: 重启实例
- cloud_create_instance: 创建实例
- cloud_delete_instance: 删除实例
- monitor_get_metrics: 查询监控指标
- monitor_list_alerts: 列出告警事件
- monitor_get_cost: 查询成本

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
    { role: 'user', content: buildUserContent(params.userMessage, params.attachments) },
  ];

  // 解析 model 覆盖配置
  const llmConfig = resolveLlmConfig(params.model);

  let finalText = '';
  let iterations = 0;

  // 动态获取 LLM 工具列表
  const tools = getLLMTools();

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
    });

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
          const result = { name: toolCall.name, success: false, data: null, error: rejectMsg };
          callbacks.onToolResult(result);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
          continue;
        }
      }

      const result = await executeTool(toolCall, params.authToken || '');
      callbacks.onToolResult(result);

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
}

/**
 * 解析 model 覆盖配置
 * - model 为空：使用默认 config.llm
 * - model 为 "provider/model" 格式：从 config.llmProviders 中查找对应 provider
 * - model 为纯模型名：使用默认 provider 的 baseUrl/apiKey，但覆盖 model
 */
function resolveLlmConfig(modelOverride?: string): ResolvedLlmConfig {
  const defaultConfig: ResolvedLlmConfig = {
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
  };

  if (!modelOverride) {
    return defaultConfig;
  }

  // 检查是否为 "provider/model" 格式
  const slashIndex = modelOverride.indexOf('/');
  if (slashIndex > 0) {
    const providerId = modelOverride.slice(0, slashIndex);
    const modelName = modelOverride.slice(slashIndex + 1);
    const provider = config.llmProviders.find(p => p.id === providerId);
    if (provider) {
      return {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: modelName,
      };
    }
  }

  // 纯模型名：使用默认 provider，覆盖 model
  return { ...defaultConfig, model: modelOverride };
}

interface LLMResponse {
  text: string;
  toolCalls: Array<ToolCall & { id: string }>;
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
}

async function callLLM(
  messages: Array<Record<string, unknown>>,
  signal: AbortSignal,
  options: CallLlmOptions
): Promise<LLMResponse> {
  const { llmConfig, temperature, maxTokens, tools } = options;

  const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      temperature: temperature ?? config.llm.temperature,
      max_tokens: maxTokens ?? config.llm.maxTokens,
      tools,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message || {};

  const text = message.content || '';
  const toolCalls: Array<ToolCall & { id: string }> = (message.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));

  return { text, toolCalls };
}
