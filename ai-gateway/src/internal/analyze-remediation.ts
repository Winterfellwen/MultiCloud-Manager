// ai-gateway/src/internal/analyze-remediation.ts
import { callLlmChat } from './llm-resolver.js';

export interface AnalyzeRemediationRequest {
  alertId: string;
  alertMessage: string;
  alertSeverity: string;
  instanceId: string;
  instanceName: string;
  instanceProvider: string;
  instanceStatus: string;
  metricName: string;
  metricValue: string;
  /** 请求作用域：'demo' 走 demo schema，其他走 public。由调用方（monitor-service）透传 */
  scope?: string;
  historicalCases?: Array<{
    outcome: string;
    symptom: string;
    rootCause: string;
    actionTaken: string;
    resolutionTime: number;
  }>;
}

export interface RemediationPlan {
  rootCause: string;
  recommendedAction: string;
  reasoning: string;
  riskLevel: string;
  expectedEffect: string;
  verificationMetric: string;
  verificationTimeout: number;
}

export async function analyzeRemediation(req: AnalyzeRemediationRequest): Promise<{ plan: RemediationPlan }> {
  const historicalSection = req.historicalCases && req.historicalCases.length > 0
    ? `\n【历史相似案例】（来自知识库）\n${req.historicalCases.map((c, i) =>
        `${i + 1}. [${c.outcome}] 类似症状：${c.symptom} → 根因：${c.rootCause} → 动作：${c.actionTaken} → ${c.resolutionTime}分钟${c.outcome === 'success' ? '后恢复' : '未恢复'}`
      ).join('\n')}`
    : '';

  const prompt = `你是云运维专家。请分析以下告警的根因并推荐修复方案。

【当前告警】
- 实例: ${req.instanceName} (${req.instanceProvider})
- 实例状态: ${req.instanceStatus}
- 指标: ${req.metricName} = ${req.metricValue}
- 告警: ${req.alertMessage}
- 严重级别: ${req.alertSeverity}
${historicalSection}

请基于${req.historicalCases && req.historicalCases.length > 0 ? '历史经验和' : ''}当前告警分析，输出 JSON 格式的修复计划：
{
  "rootCause": "根因分析",
  "recommendedAction": "reboot_instance | stop_instance | scale_up",
  "reasoning": "推荐理由",
  "riskLevel": "moderate | dangerous",
  "expectedEffect": "预期效果",
  "verificationMetric": "验证指标名（如 memory_utilization）",
  "verificationTimeout": 60
}

可选动作：reboot_instance（重启实例）、stop_instance（停止实例）、scale_up（扩容）。
请用中文回复，只输出 JSON。`;

  const raw = await callLlmChat(prompt, { temperature: 0.2, maxTokens: 1000 });

  // 解析 JSON（复用 dashboard-insight 的提取逻辑）
  const plan = extractJsonFromText(raw);
  return { plan };
}

function extractJsonFromText(text: string): RemediationPlan {
  // 策略 1：直接解析
  try { return JSON.parse(text.trim()); } catch {}

  // 策略 2：提取代码块
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }

  // 策略 3：提取 JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*?"rootCause"[\s\S]*?\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0].trim()); } catch {}
  }

  // 默认返回
  return {
    rootCause: 'AI 分析结果解析失败',
    recommendedAction: 'reboot_instance',
    reasoning: text.slice(0, 200),
    riskLevel: 'moderate',
    expectedEffect: '需要人工确认',
    verificationMetric: 'cpu_utilization',
    verificationTimeout: 60,
  };
}
