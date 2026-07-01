import { callLlmChat } from './llm-resolver.js';

export interface DashboardInsightRequest {
  totalInstances: number;
  runningInstances: number;
  stoppedInstances: number;
  firingAlerts: number;
  totalCost: number;
  providerBreakdown: { provider: string; count: number }[];
  recentAlerts: { severity: string; message: string }[];
  abnormalInstances: { name: string; provider: string; status: string }[];
}

export interface DashboardInsightResponse {
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
}

/**
 * 调用 LLM 生成 Dashboard 健康洞察（结构化 JSON 输出）
 * 使用用户在「AI 设置」页面配置的默认 provider
 */
export async function generateDashboardInsight(req: DashboardInsightRequest): Promise<DashboardInsightResponse> {
  const prompt = `你是云运维专家。请分析以下云资源概况，给出健康评估和建议。

资源概况：
- 总实例数: ${req.totalInstances}
- 运行中: ${req.runningInstances}
- 已停止: ${req.stoppedInstances}
- 当前告警数: ${req.firingAlerts}
- 本月总成本: ¥${req.totalCost.toFixed(2)}
- 厂商分布: ${req.providerBreakdown.map(p => `${p.provider}=${p.count}`).join(', ')}

最近告警:
${req.recentAlerts.map(a => `- [${a.severity}] ${a.message}`).join('\n') || '- 无'}

异常实例:
${req.abnormalInstances.map(i => `- ${i.name} (${i.provider}): ${i.status}`).join('\n') || '- 无'}

请用以下 JSON 格式回复（不要包含其他内容）：
{
  "healthScore": 0-100的整数,
  "risks": ["风险1", "风险2"],
  "suggestions": ["建议1", "建议2"]
}`;

  const raw = await callLlmChat(prompt, { temperature: 0.3, maxTokens: 2000 });

  // 解析 JSON（兼容 reasoning 模型的思考过程输出）
  const parsed = extractJsonFromText(raw);
  return {
    healthScore: parsed.healthScore ?? 0,
    risks: parsed.risks || [],
    suggestions: parsed.suggestions || [],
    raw,
  };
}

/**
 * 从 LLM 输出文本中提取 JSON 对象。
 * 兼容三种输出格式：
 * 1. 纯 JSON（理想情况）
 * 2. markdown 代码块包裹的 JSON
 * 3. reasoning 模型先输出思考过程，最后才输出 JSON（如 nemotron）
 */
function extractJsonFromText(text: string): { healthScore?: number; risks?: string[]; suggestions?: string[] } {
  // 策略 1：直接解析
  try {
    return JSON.parse(text.trim());
  } catch {}

  // 策略 2：提取 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 策略 3：从文本中提取最后一个 JSON 对象（reasoning 模型最后才输出 JSON）
  const jsonMatches = text.match(/\{[\s\S]*?"healthScore"[\s\S]*?"suggestions"[\s\S]*?\}/g);
  if (jsonMatches && jsonMatches.length > 0) {
    try {
      return JSON.parse(jsonMatches[jsonMatches.length - 1].trim());
    } catch {}
  }

  // 策略 4：正则提取各字段
  const healthScoreMatch = text.match(/"healthScore"\s*:\s*(\d+)/);
  const risksMatch = text.match(/"risks"\s*:\s*\[([\s\S]*?)\]/);
  const suggestionsMatch = text.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);

  if (healthScoreMatch || risksMatch || suggestionsMatch) {
    const risks = risksMatch
      ? risksMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || []
      : [];
    const suggestions = suggestionsMatch
      ? suggestionsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || []
      : [];
    return {
      healthScore: healthScoreMatch ? parseInt(healthScoreMatch[1], 10) : 0,
      risks,
      suggestions,
    };
  }

  return {};
}
