// 监控查询工具描述符 + 执行器（对应设计文档 5.2 节）

import { toolRegistry } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

const getMetricsDesc: ToolDescriptor = {
  name: 'monitor_get_metrics',
  description: '查询实例的监控指标（CPU、内存等）。可指定时间范围。',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: '实例 ID' },
      metric: { type: 'string', description: '指标名，如 cpu_usage_percent' },
      start: { type: 'string', description: '开始时间 ISO 格式' },
      end: { type: 'string', description: '结束时间 ISO 格式' },
    },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_get_metrics' },
  sortKey: '10',
  dangerLevel: 'safe',
};

const listAlertsDesc: ToolDescriptor = {
  name: 'monitor_list_alerts',
  description: '列出告警事件。可按状态(firing/resolved)和严重级别过滤。',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'firing | resolved' },
      severity: { type: 'string', description: 'info | warning | critical | emergency' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_list_alerts' },
  sortKey: '11',
  dangerLevel: 'safe',
};

const getCostDesc: ToolDescriptor = {
  name: 'monitor_get_cost',
  description: '查询成本汇总。可按云厂商和时间范围过滤。返回各云厂商的费用明细。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商' },
      start: { type: 'string', description: '开始时间 ISO 格式' },
      end: { type: 'string', description: '结束时间 ISO 格式' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_get_cost' },
  sortKey: '12',
  dangerLevel: 'safe',
};

toolRegistry.register(getMetricsDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.metric) params.set('metric', args.metric as string);
  if (args.start) params.set('start', args.start as string);
  if (args.end) params.set('end', args.end as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/metrics/${args.instanceId}?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});

toolRegistry.register(listAlertsDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status as string);
  if (args.severity) params.set('severity', args.severity as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/alerts/events?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});

toolRegistry.register(getCostDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.start) params.set('start', args.start as string);
  if (args.end) params.set('end', args.end as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/costs/summary?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});
