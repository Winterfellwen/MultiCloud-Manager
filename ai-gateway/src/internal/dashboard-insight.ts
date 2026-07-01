import { config } from '../config.js';

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

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}`);
  }

  const data: any = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';

  // 解析 JSON（LLM 可能包含 markdown 代码块）
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      healthScore: parsed.healthScore ?? 0,
      risks: parsed.risks || [],
      suggestions: parsed.suggestions || [],
      raw,
    };
  } catch {
    return { healthScore: 0, risks: [], suggestions: [], raw };
  }
}
