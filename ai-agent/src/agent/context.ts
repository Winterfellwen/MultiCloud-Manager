// 上下文构建：组装 LLM Context（system prompt + history + tools）

import type { Context, Message, Tool } from '../llm/types.js';
import type { ToolPlan } from '../tools/types.js';
import { toLLMTools } from '../tools/protocol.js';

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助运维人员通过自然语言管理多云资源。

你的能力：
1. 查询和管理云服务器实例 — 列出、查看、创建、启动、停止、重启、删除
2. 查询和管理各类云资源 — 磁盘、数据库、缓存、VPC、安全组、CDN、集群等
3. 触发云资源同步
4. 查询监控指标和告警事件
5. 查询成本分析
6. 执行Shell命令（仅Action/Confirm模式，Plan模式不可用）

支持的云厂商：aws | aliyun | azure | tencent | huawei

工作原则：
- 对于查询类操作，直接调用工具执行
- 对于危险操作（停止、重启、删除），系统会要求用户确认，你需要在回复中说明操作影响
- 用中文回复，简洁专业
- 如果用户意图不明确，先调用 list_instances 等查询工具获取上下文，再确认操作目标
- 工具返回的是 JSON，你需要提取关键信息用自然语言总结给用户

⚠️ 错误处理规则（必须严格遵守）：
- 工具返回的 JSON 中如果包含 "success": false 或 "error": true，表示操作失败
- 如果工具返回 "message" 字段包含"失败"、"错误"、"failed"、"error"等关键词，必须明确告知用户操作失败
- 绝对不能在操作失败时告诉用户操作成功
- 示例：如果工具返回 {"success": false, "error": true, "message": "云服务请求失败: fetch failed"}，你应该回复："操作失败，原因：云服务请求失败，请检查云服务连接是否正常。"`;

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
