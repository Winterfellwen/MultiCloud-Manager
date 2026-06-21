// 工具执行（复用 ai-agent 的工具系统，对接 cloud/monitor service）
// 简化版：直接 HTTP 调用后端服务
//
// 工具动态注册：每个工具带 dangerLevel（safe/moderate/dangerous）和 group 分组
// - getToolCatalog(): 返回工具目录（分组+描述+risk级别）
// - getLLMTools(): 返回 LLM function-calling 格式的工具列表
// - getLLMToolsForMode(): 根据当前模式返回可用工具列表

import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';

const execAsync = promisify(exec);

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

/** 模式类型 */
export type ModeType = 'plan' | 'action' | 'confirm';

// ============ 工具注册表 ============

const PROVIDER_LIST = 'aws | aliyun | azure | tencent | huawei';
const RESOURCE_TYPES = 'instance | disk | bucket | database | cache | loadbalancer | vpc | securitygroup | cdn | cluster | aiservice';

/** 所有已注册工具的元信息（按 group 组织） */
const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'cloud',
    label: '云实例管理',
    tools: [
      {
        name: 'cloud_list_instances',
        label: '列出云实例',
        description: `列出云服务器实例。支持厂商: ${PROVIDER_LIST}`,
        dangerLevel: 'safe',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
            region: { type: 'string', description: '区域/可用区' },
            status: { type: 'string', description: '状态: running/stopped/terminated' },
          },
        },
      },
      {
        name: 'cloud_get_instance',
        label: '查看实例详情',
        description: '查看云服务器实例的详细信息',
        dangerLevel: 'safe',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_start_instance',
        label: '启动实例',
        description: '启动一台已停止的云服务器实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_stop_instance',
        label: '停止实例',
        description: '停止一台运行中的云服务器实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_reboot_instance',
        label: '重启实例',
        description: '重启一台云服务器实例',
        dangerLevel: 'moderate',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_create_instance',
        label: '创建实例',
        description: `创建一台新的云服务器实例。支持厂商: ${PROVIDER_LIST}`,
        dangerLevel: 'dangerous',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
            region: { type: 'string', description: '区域/可用区' },
            name: { type: 'string', description: '实例名称' },
            instanceType: { type: 'string', description: '实例规格（如 t3.micro、ecs.g6.large）' },
            imageId: { type: 'string', description: '镜像 ID' },
          },
          required: ['provider', 'region', 'name', 'instanceType', 'imageId'],
        },
      },
      {
        name: 'cloud_delete_instance',
        label: '删除实例',
        description: '永久删除一台云服务器实例（不可恢复）',
        dangerLevel: 'dangerous',
        group: 'cloud',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '实例 ID（内部UUID）' } },
          required: ['id'],
        },
      },
    ],
  },
  {
    id: 'cloud-resources',
    label: '云资源管理',
    tools: [
      {
        name: 'cloud_list_resources',
        label: '列出云资源',
        description: `列出各类云资源（磁盘/数据库/缓存/VPC等）。支持类型: ${RESOURCE_TYPES}。支持厂商: ${PROVIDER_LIST}`,
        dangerLevel: 'safe',
        group: 'cloud-resources',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
            resourceType: { type: 'string', description: `资源类型: ${RESOURCE_TYPES}` },
            region: { type: 'string', description: '区域/可用区' },
            status: { type: 'string', description: '状态筛选' },
            search: { type: 'string', description: '按名称模糊搜索' },
          },
        },
      },
      {
        name: 'cloud_get_resource',
        label: '查看资源详情',
        description: '查看云资源的详细信息（包含类型特定属性）',
        dangerLevel: 'safe',
        group: 'cloud-resources',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '资源 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_delete_resource',
        label: '删除资源',
        description: '删除一个云资源（仅部分类型支持，如磁盘、对象存储桶）',
        dangerLevel: 'dangerous',
        group: 'cloud-resources',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '资源 ID（内部UUID）' } },
          required: ['id'],
        },
      },
      {
        name: 'cloud_sync_resources',
        label: '触发资源同步',
        description: '触发云资源同步，从云厂商拉取最新资源列表',
        dangerLevel: 'moderate',
        group: 'cloud-resources',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}（不填则同步全部）` },
            resourceType: { type: 'string', description: `资源类型: ${RESOURCE_TYPES}（不填则同步全部类型）` },
          },
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
        description: '查询指定实例的监控指标（CPU、内存、磁盘等）',
        dangerLevel: 'safe',
        group: 'monitor',
        parameters: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', description: '实例 ID（内部UUID）' },
            metric: { type: 'string', description: '指标名（如 cpu_utilization、memory_used）' },
          },
          required: ['instanceId'],
        },
      },
      {
        name: 'monitor_list_alerts',
        label: '列出告警事件',
        description: '列出监控告警事件',
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
        description: '查询云资源成本汇总',
        dangerLevel: 'safe',
        group: 'monitor',
        parameters: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
          },
        },
      },
    ],
  },
  {
    id: 'system',
    label: '系统工具',
    tools: [
      {
        name: 'shell_execute',
        label: '执行Shell命令',
        description: '在服务器上执行Shell命令。仅在Action/Confirm模式下可用，Plan模式不可用。支持常见的系统管理操作，如查看文件、进程管理、网络诊断等。',
        dangerLevel: 'dangerous',
        group: 'system',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的Shell命令' },
            timeout: { type: 'number', description: '超时时间（秒），默认30，最大60' },
          },
          required: ['command'],
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
 * 获取 LLM function-calling 格式的工具列表（根据当前模式过滤）
 * @param mode 当前模式，plan 模式下排除 shell_execute
 */
export function getLLMToolsForMode(mode?: ModeType): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getAllTools()
    .filter(t => {
      // Plan 模式下排除 shell_execute
      if (mode === 'plan' && t.name === 'shell_execute') return false;
      return true;
    })
    .map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
}

/**
 * 获取 LLM function-calling 格式的工具列表（兼容旧接口，默认包含全部）
 */
export function getLLMTools(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getLLMToolsForMode();
}

// ============ Shell 执行 ============

/**
 * 执行 Shell 命令
 */
async function executeShell(
  command: string,
  timeoutSeconds: number = 30
): Promise<ToolResult> {
  const timeout = Math.min(Math.max(timeoutSeconds, 1), 60) * 1000;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, LANG: 'en_US.UTF-8' },
    });

    return {
      name: 'shell_execute',
      success: true,
      data: {
        command,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        duration: '< 1s',
      },
    };
  } catch (err: any) {
    return {
      name: 'shell_execute',
      success: false,
      data: {
        command,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || '',
        exitCode: err.code || 1,
      },
      error: `Shell命令执行失败: ${err.message}`,
    };
  }
}

// ============ 工具执行 ============

/**
 * 执行工具调用
 */
export async function executeTool(
  toolCall: ToolCall,
  authToken: string,
  mode?: ModeType
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  // Shell 执行工具需要模式检查
  if (name === 'shell_execute') {
    if (mode === 'plan') {
      return {
        name,
        success: false,
        data: null,
        error: 'Shell执行在Plan模式下不可用，请切换到Action或Confirm模式',
      };
    }
    return executeShell(
      args.command as string,
      args.timeout as number | undefined
    );
  }

  try {
    switch (name) {
      // 实例管理
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

      // 资源管理
      case 'cloud_list_resources':
        return await callCloudService('/cloud/resources', 'GET', args, authToken);
      case 'cloud_get_resource':
        return await callCloudService(`/cloud/resources/${args.id}`, 'GET', {}, authToken);
      case 'cloud_delete_resource':
        return await callCloudService(`/cloud/resources/${args.id}`, 'DELETE', {}, authToken);
      case 'cloud_sync_resources':
        return await callCloudService('/cloud/resources/sync', 'POST', args, authToken);

      // 监控
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

  // 重试机制：最多重试2次，指数退避
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: method !== 'GET' ? JSON.stringify(args) : undefined,
      });

      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        const waitTime = Math.pow(2, attempt) * 500;
        console.log(`Cloud service error ${res.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      const data = await res.json();
      return { name: path, success: res.ok, data };
    } catch (err) {
      lastError = err as Error;
      const errorMsg = (err as Error).message || '网络连接失败';

      if (attempt < maxRetries && (
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('timeout')
      )) {
        const waitTime = Math.pow(2, attempt) * 500;
        console.log(`Cloud service network error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      return { name: path, success: false, data: null, error: `云服务请求失败: ${errorMsg}` };
    }
  }

  const errorMsg = lastError?.message || '网络连接失败';
  return { name: path, success: false, data: null, error: `云服务请求失败: ${errorMsg}` };
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

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: method !== 'GET' ? JSON.stringify(args) : undefined,
      });

      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        const waitTime = Math.pow(2, attempt) * 500;
        console.log(`Monitor service error ${res.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      const data = await res.json();
      return { name: path, success: res.ok, data };
    } catch (err) {
      lastError = err as Error;
      const errorMsg = (err as Error).message || '网络连接失败';

      if (attempt < maxRetries && (
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('timeout')
      )) {
        const waitTime = Math.pow(2, attempt) * 500;
        console.log(`Monitor service network error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      return { name: path, success: false, data: null, error: `监控服务请求失败: ${errorMsg}` };
    }
  }

  const errorMsg = lastError?.message || '网络连接失败';
  return { name: path, success: false, data: null, error: `监控服务请求失败: ${errorMsg}` };
}
