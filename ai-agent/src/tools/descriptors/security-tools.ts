// ai-agent/src/tools/descriptors/security-tools.ts
// AI Agent 工具：安全扫描 + 容量分析（只读，调用 monitor-service API）

import { toolRegistry } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

const securityScanDesc: ToolDescriptor = {
  name: 'security_scan',
  description: '扫描云资源安全风险，检测公开暴露、未加密存储、弱安全组、闲置资源等问题。返回风险列表和修复建议。',
  inputSchema: {
    type: 'object',
    properties: {
      severity: { type: 'string', description: '过滤严重度: critical | warning | all' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'security_scan' },
  sortKey: '20',
  dangerLevel: 'safe',
};

const capacityAnalyzeDesc: ToolDescriptor = {
  name: 'capacity_analyze',
  description: '分析资源容量瓶颈，预测哪些实例即将超载，给出扩容建议（升配/扩容）和预计时间。',
  inputSchema: {
    type: 'object',
    properties: {
      metric: { type: 'string', description: 'cpu_utilization | memory_utilization | disk_utilization | all' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'capacity_analyze' },
  sortKey: '21',
  dangerLevel: 'safe',
};

toolRegistry.register(securityScanDesc, async (args, ctx) => {
  // 先获取汇总
  const summaryRes = await fetch(
    `${ctx.monitorServiceUrl}/monitor/security/summary`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  const summary = await summaryRes.json() as {
    critical: number;
    warning: number;
    total: number;
    byRule: Record<string, number>;
    lastScannedAt: string | null;
  };

  let response = `安全扫描结果：${summary.critical} 个严重问题，${summary.warning} 个警告（共 ${summary.total} 条）\n`;

  if (summary.lastScannedAt) {
    response += `最近扫描时间：${new Date(summary.lastScannedAt).toLocaleString('zh-CN')}\n`;
  }

  response += `\n按规则分布：\n`;
  for (const [rule, count] of Object.entries(summary.byRule)) {
    response += `  - ${rule}: ${count} 条\n`;
  }

  // 如果有发现，获取详情
  if (summary.total > 0) {
    const findingsRes = await fetch(
      `${ctx.monitorServiceUrl}/monitor/security/findings`,
      { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
    );
    const findings = await findingsRes.json() as Array<{
      symptom: string;
      instanceProvider: string;
      rootCause: string;
      outcome: string;
    }>;

    // 按 severity 过滤
    const filtered = args.severity && args.severity !== 'all'
      ? findings.filter((f) => f.outcome === args.severity)
      : findings;

    response += `\n详细列表：\n`;
    for (const f of filtered.slice(0, 10)) {
      response += `  [${f.outcome}] ${f.symptom} (${f.instanceProvider})\n`;
      response += `    建议：${f.rootCause}\n`;
    }

    if (summary.critical > 0) {
      response += `\n建议：对 critical 问题立即处理，可通过 remediation 流程自动修复。`;
    }
  } else {
    response += `\n暂无安全风险发现。`;
  }

  return response;
});

toolRegistry.register(capacityAnalyzeDesc, async (_args, ctx) => {
  const summaryRes = await fetch(
    `${ctx.monitorServiceUrl}/monitor/capacity/summary`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  const summary = await summaryRes.json() as {
    urgent: number;
    recommend: number;
    total: number;
    urgentPredictions: number;
    predictions: Array<{
      instanceId: string;
      metricName: string;
      currentValue: string;
      predictedValue: string;
      hoursToThreshold: string;
      confidence: string;
    }>;
  };

  let response = `容量分析结果：${summary.urgent} 个紧急，${summary.recommend} 个建议\n`;
  response += `72h 内即将超阈值的预测：${summary.urgentPredictions} 条\n`;

  if (summary.urgentPredictions > 0) {
    response += `\n紧急预测：\n`;
    for (const p of summary.predictions) {
      const metricLabel = p.metricName === 'memory_utilization' ? '内存'
        : p.metricName === 'cpu_utilization' ? 'CPU'
        : '磁盘';
      response += `  - 实例 ${p.instanceId}: ${metricLabel} 当前 ${p.currentValue}%，预计 ${Math.round(parseFloat(p.hoursToThreshold))}h 后达到 ${p.predictedValue}%\n`;
      response += `    置信度 ${p.confidence}%\n`;
    }
  }

  // 获取扩容建议详情
  if (summary.total > 0) {
    const recsRes = await fetch(
      `${ctx.monitorServiceUrl}/monitor/capacity/recommendations`,
      { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
    );
    const recs = await recsRes.json() as Array<{
      symptom: string;
      rootCause: string;
      outcome: string;
    }>;

    response += `\n扩容建议：\n`;
    for (const r of recs.slice(0, 10)) {
      response += `  [${r.outcome}] ${r.symptom}\n`;
      response += `    方案：${r.rootCause}\n`;
    }
  } else {
    response += `\n暂无容量风险。`;
  }

  return response;
});
