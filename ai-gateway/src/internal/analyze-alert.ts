import { config } from '../config.js';

export interface AnalyzeAlertRequest {
  alertId: string;
  ruleName: string;
  metric: string;
  condition: string;
  currentValue: string;
  instanceName: string;
  instanceId?: string;
  severity: string;
  message: string;
}

export interface AnalyzeAlertResponse {
  analysis: string;
}

/**
 * 调用 LLM 分析告警根因（Plan 模式，只读分析，不执行工具）
 */
export async function analyzeAlert(req: AnalyzeAlertRequest): Promise<AnalyzeAlertResponse> {
  const prompt = `你是云运维专家。请分析以下告警的根因，并给出修复建议。

告警详情：
- 规则名称: ${req.ruleName}
- 指标: ${req.metric}
- 触发条件: ${req.condition}
- 当前值: ${req.currentValue}
- 实例: ${req.instanceName}
- 严重级别: ${req.severity}
- 告警消息: ${req.message}

请按以下格式输出分析结果：
1. 可能的根因（列出 2-3 个最可能的原因）
2. 修复建议（针对每个根因给出具体操作步骤）
3. 预防措施（避免再次发生的长期建议）

请用中文回复，简洁专业。`;

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const analysis = data.choices?.[0]?.message?.content || '';

  return { analysis };
}
