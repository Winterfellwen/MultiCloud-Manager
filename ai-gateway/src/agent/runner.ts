// Agent Runner（复用 ai-agent 的 LLM 调用逻辑，适配事件回调）
// 调用 LLM + 执行工具 + 推送事件

import { config } from '../config.js';
import { executeTool, type ToolCall } from './tools.js';

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

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'cloud_list_instances',
      description: '列出云服务器实例',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: '云厂商: aws/aliyun/azure' },
          status: { type: 'string', description: '状态: running/stopped' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_get_instance',
      description: '查看实例详情',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_start_instance',
      description: '启动实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_stop_instance',
      description: '停止实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_reboot_instance',
      description: '重启实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monitor_list_alerts',
      description: '列出告警事件',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '状态: firing/resolved' },
          severity: { type: 'string', description: '严重级别: info/warning/critical/emergency' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monitor_get_cost',
      description: '查询成本汇总',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: '云厂商' },
        },
      },
    },
  },
];

/**
 * 执行 Agent turn（调用 LLM + 工具循环）
 */
export async function runAgentTurn(
  params: AgentTurnParams,
  callbacks: AgentTurnCallbacks
): Promise<void> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: params.userMessage },
  ];

  let finalText = '';
  let iterations = 0;

  while (iterations < config.agent.maxIterations) {
    iterations++;

    if (params.signal.aborted) {
      throw new Error('Run aborted');
    }

    // 调用 LLM
    const response = await callLLM(messages, params.signal);

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

interface LLMResponse {
  text: string;
  toolCalls: Array<ToolCall & { id: string }>;
}

async function callLLM(
  messages: Array<Record<string, unknown>>,
  signal: AbortSignal
): Promise<LLMResponse> {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: config.llm.temperature,
      max_tokens: config.llm.maxTokens,
      tools: TOOLS,
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
