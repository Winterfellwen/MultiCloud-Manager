// 工具执行（复用 ai-agent 的工具系统，对接 cloud/monitor service）
// 简化版：直接 HTTP 调用后端服务
//
// 工具动态注册：每个工具带 dangerLevel（safe/moderate/dangerous）和 group 分组
// - getToolCatalog(): 返回工具目录（分组+描述+risk级别）
// - getLLMTools(): 返回 LLM function-calling 格式的工具列表

import { config } from '../config.js';

// ============ 类型定义 ============

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  success: boolean;
  data: unknown;
  error?: string;
}

/** 工具危险级别 */
export type DangerLevel = 'safe' | 'moderate' | 'dangerous';

/** 工具定义（包含元信息） */
export interface ToolDefinition {
  /** 工具唯一 ID（与 LLM function name 一致） */
  name: string;
  /** 显示标签 */
  label: string;
  /** 工具描述 */
  description: string;
  /** JSON Schema 参数定义 */
  parameters: Record<string, unknown>;
  /** 危险级别 */
  dangerLevel: DangerLevel;
  /** 所属分组 ID */
  group: string;
}

/** 工具分组 */
export interface ToolGroup {
  /** 分组 ID */
  id: string;
  /** 分组显示标签 */
  label: string;
  /** 该分组下的工具 */
  tools: ToolDefinition[];
}

// ============ 工具注册表 ============

/** 所有已注册工具的元信息（按 group 组织） */
const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'cloud',
    label: '云资源管理',
    tools: [
      {
        name: 'cloud_list_instances',
        label: '列出云实例',
        description: '列出云服务器实例',
        dangerLevel: 'safe',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: '云厂商: aws/aliyun/azure' },
            status: { type: 'string', description: '状态: running/stopped' },
          },
        },
      },
      {
        name: 'cloud_get_instance',
        label: '查看实例详情',
        description: '查看实例详情',
        dangerLevel: 'safe',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_start_instance',
        label: '启动实例',
        description: '启动实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_stop_instance',
        label: '停止实例',
        description: '停止实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_reboot_instance',
        label: '重启实例',
        description: '重启实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_create_instance',
        label: '创建实例',
        description: '创建实例',
        dangerLevel: 'dangerous',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: '云厂商' },
            name: { type: 'string', description: '实例名称' },
            flavor: { type: 'string', description: '规格' },
          },
          required: ['provider', 'name'],
        },
      },
      {
        name: 'cloud_delete_instance',
        label: '删除实例',
        description: '删除实例',
        dangerLevel: 'dangerous',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID' } },
          required: ['id'],
        },
      },
    ],
  },
  {
    id: 'monitor',
    label: '监控告警',
    tools: [
      {
        name: 'monitor_get_metrics',
        label: '查询监控指标',
        description: '查询监控指标',
        dangerLevel: 'safe',
        group: 'monitor',
        parameters: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: '实例 ID' },
            metric: { type: 'string', description: '指标名' },
          },
          required: ['instanceId'],
        },
      },
      {
        name: 'monitor_list_alerts',
        label: '列出告警事件',
        description: '列出告警事件',
        dangerLevel: 'safe',
        group: 'monitor',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: '状态: firing/resolved' },
            severity: { type: 'string', description: '严重级别: info/warning/critical/emergency' },
          },
        },
      },
      {
        name: 'monitor_get_cost',
        label: '查询成本汇总',
        description: '查询成本汇总',
        dangerLevel: 'safe',
        group: 'monitor',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: '云厂商' },
          },
        },
      },
    ],
  },
];

// ============ 工具目录查询 ============

/**
 * 获取工具目录（分组+描述+risk级别）
 * 用于 tools.catalog RPC
 */
export function getToolCatalog(): ToolGroup[] {
  // 返回深拷贝避免外部修改
  return TOOL_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    tools: group.tools.map(t => ({ ...t, parameters: { ...t.parameters } })),
  }));
}

/**
 * 获取所有工具定义（扁平列表）
 */
export function getAllTools(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools);
}

/**
 * 按工具名查找工具定义
 */
export function findTool(name: string): ToolDefinition | undefined {
  return getAllTools().find(t => t.name === name);
}

/**
 * 获取 LLM function-calling 格式的工具列表
 * 用于调用 LLM 时的 tools 参数
 */
export function getLLMTools(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getAllTools().map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ============ 工具执行 ============

/**
 * 执行工具调用
 */
export async function executeTool(
  toolCall: ToolCall,
  authToken: string
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  try {
    switch (name) {
      case 'cloud_list_instances':
        return await callCloudService('/cloud/instances', 'GET', args, authToken);
      case 'cloud_get_instance':
        return await callCloudService(`/cloud/instances/${args.id}`, 'GET', {}, authToken);
      case 'cloud_start_instance':
        return await callCloudService(`/cloud/instances/${args.id}/start`, 'POST', {}, authToken);
      case 'cloud_stop_instance':
        return await callCloudService(`/cloud/instances/${args.id}/stop`, 'POST', {}, authToken);
      case 'cloud_reboot_instance':
        return await callCloudService(`/cloud/instances/${args.id}/reboot`, 'POST', {}, authToken);
      case 'cloud_create_instance':
        return await callCloudService('/cloud/instances', 'POST', args, authToken);
      case 'cloud_delete_instance':
        return await callCloudService(`/cloud/instances/${args.id}`, 'DELETE', {}, authToken);
      case 'monitor_get_metrics':
        return await callMonitorService(`/monitor/metrics/${args.instanceId}`, 'GET', args, authToken);
      case 'monitor_list_alerts':
        return await callMonitorService('/monitor/alerts/events', 'GET', args, authToken);
      case 'monitor_get_cost':
        return await callMonitorService('/monitor/costs/summary', 'GET', args, authToken);
      default:
        return { name, success: false, data: null, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return {
      name,
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function callCloudService(
  path: string,
  method: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<ToolResult> {
  const url = new URL(`${config.cloudServiceUrl}${path}`);
  if (method === 'GET') {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: method !== 'GET' ? JSON.stringify(args) : undefined,
  });

  const data = await res.json();
  return { name: path, success: res.ok, data };
}

async function callMonitorService(
  path: string,
  method: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<ToolResult> {
  const url = new URL(`${config.monitorServiceUrl}${path}`);
  if (method === 'GET') {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: method !== 'GET' ? JSON.stringify(args) : undefined,
  });

  const data = await res.json();
  return { name: path, success: res.ok, data };
}
