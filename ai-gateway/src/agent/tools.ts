// 工具执行（复用 ai-agent 的工具系统，对接 cloud/monitor service）
// 简化版：直接 HTTP 调用后端服务

import { config } from '../config.js';

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
