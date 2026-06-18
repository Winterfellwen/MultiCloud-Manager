// 上下文构建：组装 LLM Context（system prompt + history + tools）

import type { Context, Message, Tool } from '../llm/types.js';
import type { ToolPlan } from '../tools/types.js';
import { toLLMTools } from '../tools/protocol.js';

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助运维人员通过自然语言管理多云资源。

你的能力：
1. 查询和管理云服务器实例（AWS、阿里云、Azure）— 列出、查看、创建、启动、停止、重启、删除
2. 查询监控指标和告警事件
3. 查询成本分析

工作原则：
- 对于查询类操作，直接调用工具执行
- 对于危险操作（停止、重启、删除），系统会要求用户确认，你需要在回复中说明操作影响
- 用中文回复，简洁专业
- 如果用户意图不明确，先调用 list_instances 等查询工具获取上下文，再确认操作目标
- 工具返回的是 JSON，你需要提取关键信息用自然语言总结给用户

当前可用的云厂商：aws, aliyun, azure`;

export function buildContext(
  messages: Message[],
  plan: ToolPlan,
  options?: { maxMessages?: number }
): Context {
  const maxMessages = options?.maxMessages || 20;
  const recentMessages = messages.slice(-maxMessages);
  const llmTools: Tool[] = toLLMTools(plan.visible);

  return {
    systemPrompt: SYSTEM_PROMPT,
    messages: recentMessages,
    tools: llmTools.length > 0 ? llmTools : undefined,
  };
}
