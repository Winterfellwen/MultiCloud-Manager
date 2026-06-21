// 云资源操作工具描述符 + 执行器

import { toolRegistry, type ToolExecutor, type ToolExecutionContext } from '../registry.js';
import type { ToolDescriptor } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROVIDER_LIST = 'aws | aliyun | azure | tencent | huawei';
const RESOURCE_TYPES = 'instance | disk | bucket | database | cache | loadbalancer | vpc | securitygroup | cdn | cluster | aiservice';

// ============ 实例管理工具 ============

const listInstancesDesc: ToolDescriptor = {
  name: 'cloud_list_instances',
  description: `列出云服务器实例。支持按云厂商(provider)、区域(region)、状态(status)过滤。支持厂商: ${PROVIDER_LIST}`,
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
      region: { type: 'string', description: '区域，如 us-east-1, cn-shanghai' },
      status: { type: 'string', description: '状态过滤: running | stopped | terminated' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_list_instances' },
  sortKey: '01',
  dangerLevel: 'safe',
};

const getInstanceDesc: ToolDescriptor = {
  name: 'cloud_get_instance',
  description: '查看单台云服务器实例的详细信息（规格、IP、标签、费用等）。',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: '实例 ID（内部UUID）' },
    },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_get_instance' },
  sortKey: '02',
  dangerLevel: 'safe',
};

const startInstanceDesc: ToolDescriptor = {
  name: 'cloud_start_instance',
  description: '启动一台云服务器实例。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID（内部UUID）' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_start_instance' },
  sortKey: '03',
  dangerLevel: 'moderate',
};

const stopInstanceDesc: ToolDescriptor = {
  name: 'cloud_stop_instance',
  description: '关机（停止）一台云服务器实例。注意：停止后服务将不可用。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID（内部UUID）' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_stop_instance' },
  sortKey: '04',
  dangerLevel: 'moderate',
};

const rebootInstanceDesc: ToolDescriptor = {
  name: 'cloud_reboot_instance',
  description: '重启一台云服务器实例。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID（内部UUID）' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_reboot_instance' },
  sortKey: '05',
  dangerLevel: 'moderate',
};

const createInstanceDesc: ToolDescriptor = {
  name: 'cloud_create_instance',
  description: `创建一台新的云服务器实例。需要指定云厂商、区域、规格、镜像和实例名称。支持厂商: ${PROVIDER_LIST}`,
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
      region: { type: 'string', description: '区域，如 us-east-1, cn-shanghai, eastus' },
      instanceType: { type: 'string', description: '规格，如 t3.micro, ecs.t6-c1m2, Standard_D2s_v3' },
      imageId: { type: 'string', description: '镜像 ID 或别名，如 UbuntuLTS, Debian11, CentOS85' },
      name: { type: 'string', description: '实例名称' },
    },
    required: ['provider', 'region', 'instanceType', 'imageId', 'name'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_create_instance' },
  sortKey: '06',
  dangerLevel: 'dangerous',
};

const deleteInstanceDesc: ToolDescriptor = {
  name: 'cloud_delete_instance',
  description: '删除一台云服务器实例。⚠️ 此操作不可逆，实例及其数据将被永久删除。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID（内部UUID）' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_delete_instance' },
  sortKey: '07',
  dangerLevel: 'dangerous',
};

// ============ 资源管理工具 ============

const listResourcesDesc: ToolDescriptor = {
  name: 'cloud_list_resources',
  description: `列出各类云资源（磁盘/数据库/缓存/VPC等）。支持类型: ${RESOURCE_TYPES}。支持厂商: ${PROVIDER_LIST}`,
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}` },
      resourceType: { type: 'string', description: `资源类型: ${RESOURCE_TYPES}` },
      region: { type: 'string', description: '区域/可用区' },
      status: { type: 'string', description: '状态筛选' },
      search: { type: 'string', description: '按名称模糊搜索' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_list_resources' },
  sortKey: '08',
  dangerLevel: 'safe',
};

const getResourceDesc: ToolDescriptor = {
  name: 'cloud_get_resource',
  description: '查看云资源的详细信息（包含类型特定属性）。',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: '资源 ID（内部UUID）' } },
    required: ['id'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_get_resource' },
  sortKey: '09',
  dangerLevel: 'safe',
};

const deleteResourceDesc: ToolDescriptor = {
  name: 'cloud_delete_resource',
  description: '删除一个云资源（仅部分类型支持，如磁盘、对象存储桶）。',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: '资源 ID（内部UUID）' } },
    required: ['id'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_delete_resource' },
  sortKey: '10',
  dangerLevel: 'dangerous',
};

const syncResourcesDesc: ToolDescriptor = {
  name: 'cloud_sync_resources',
  description: '触发云资源同步，从云厂商拉取最新资源列表。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: `云厂商: ${PROVIDER_LIST}（不填则同步全部）` },
      resourceType: { type: 'string', description: `资源类型: ${RESOURCE_TYPES}（不填则同步全部类型）` },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_sync_resources' },
  sortKey: '11',
  dangerLevel: 'moderate',
};

// ============ Shell 执行工具 ============

const shellExecuteDesc: ToolDescriptor = {
  name: 'shell_execute',
  description: '在服务器上执行Shell命令。仅在Action/Confirm模式下可用，Plan模式不可用。支持常见的系统管理操作。',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的Shell命令' },
      timeout: { type: 'number', description: '超时时间（秒），默认30，最大60' },
    },
    required: ['command'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'shell_execute' },
  sortKey: '12',
  dangerLevel: 'dangerous',
};

// ============ 执行器 ============

function makeCloudExecutor(method: string, pathBuilder: (args: Record<string, unknown>) => string, bodyBuilder?: (args: Record<string, unknown>) => Record<string, unknown> | undefined): ToolExecutor {
  return async (args, ctx: ToolExecutionContext) => {
    const path = pathBuilder(args);
    const url = `${ctx.cloudServiceUrl}/cloud/instances${path}`;

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {}),
          },
          body: bodyBuilder ? JSON.stringify(bodyBuilder(args)) : undefined,
        });
        const data = await res.json();
        if (!res.ok) {
          return JSON.stringify({ success: false, error: true, status: res.status, message: data.message || data.error });
        }
        return JSON.stringify({ success: true, ...data });
      } catch (err) {
        lastError = err as Error;
        const errorMsg = (err as Error).message || '网络连接失败';

        if (attempt < maxRetries && (
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('network')
        )) {
          const waitTime = Math.pow(2, attempt) * 500;
          console.log(`Cloud service request failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        return JSON.stringify({
          success: false,
          error: true,
          message: `云服务请求失败: ${errorMsg}`,
          url,
          method,
        });
      }
    }

    const errorMsg = lastError?.message || '网络连接失败';
    return JSON.stringify({
      success: false,
      error: true,
      message: `云服务请求失败: ${errorMsg}`,
      url,
      method,
    });
  };
}

function makeResourceExecutor(method: string, pathBuilder: (args: Record<string, unknown>) => string, bodyBuilder?: (args: Record<string, unknown>) => Record<string, unknown> | undefined): ToolExecutor {
  return async (args, ctx: ToolExecutionContext) => {
    const path = pathBuilder(args);
    const url = `${ctx.cloudServiceUrl}/cloud/resources${path}`;

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {}),
          },
          body: bodyBuilder ? JSON.stringify(bodyBuilder(args)) : undefined,
        });
        const data = await res.json();
        if (!res.ok) {
          return JSON.stringify({ success: false, error: true, status: res.status, message: data.message || data.error });
        }
        return JSON.stringify({ success: true, ...data });
      } catch (err) {
        lastError = err as Error;
        const errorMsg = (err as Error).message || '网络连接失败';

        if (attempt < maxRetries && (
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('network')
        )) {
          const waitTime = Math.pow(2, attempt) * 500;
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        return JSON.stringify({
          success: false,
          error: true,
          message: `云服务请求失败: ${errorMsg}`,
        });
      }
    }

    const errorMsg = lastError?.message || '网络连接失败';
    return JSON.stringify({
      success: false,
      error: true,
      message: `云服务请求失败: ${errorMsg}`,
    });
  };
}

// ============ 注册工具 ============

// 实例管理
toolRegistry.register(listInstancesDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.region) params.set('region', args.region as string);
  if (args.status) params.set('status', args.status as string);

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${ctx.cloudServiceUrl}/cloud/instances?${params}`, {
        headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        return JSON.stringify({ success: false, error: true, status: res.status, message: data.message || data.error });
      }
      return JSON.stringify({ success: true, ...data });
    } catch (err) {
      lastError = err as Error;
      const errorMsg = (err as Error).message || '网络连接失败';

      if (attempt < maxRetries && (
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('network')
      )) {
        const waitTime = Math.pow(2, attempt) * 500;
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      return JSON.stringify({
        success: false,
        error: true,
        message: `云服务请求失败: ${errorMsg}`,
      });
    }
  }

  const errorMsg = lastError?.message || '网络连接失败';
  return JSON.stringify({
    success: false,
    error: true,
    message: `云服务请求失败: ${errorMsg}`,
  });
});

toolRegistry.register(getInstanceDesc, makeCloudExecutor('GET', (a) => `/${a.instanceId}`));
toolRegistry.register(startInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/start`));
toolRegistry.register(stopInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/stop`));
toolRegistry.register(rebootInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/reboot`));
toolRegistry.register(createInstanceDesc, makeCloudExecutor('POST', () => '', (a) => ({
  provider: a.provider,
  region: a.region,
  instanceType: a.instanceType,
  name: a.name,
})));
toolRegistry.register(deleteInstanceDesc, makeCloudExecutor('DELETE', (a) => `/${a.instanceId}`));

// 资源管理
toolRegistry.register(listResourcesDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.resourceType) params.set('resourceType', args.resourceType as string);
  if (args.region) params.set('region', args.region as string);
  if (args.status) params.set('status', args.status as string);
  if (args.search) params.set('search', args.search as string);

  try {
    const res = await fetch(`${ctx.cloudServiceUrl}/cloud/resources?${params}`, {
      headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {},
    });
    const data = await res.json();
    if (!res.ok) {
      return JSON.stringify({ success: false, error: true, status: res.status, message: data.message || data.error });
    }
    return JSON.stringify({ success: true, ...data });
  } catch (err) {
    const errorMsg = (err as Error).message || '网络连接失败';
    return JSON.stringify({ success: false, error: true, message: `云服务请求失败: ${errorMsg}` });
  }
});

toolRegistry.register(getResourceDesc, makeResourceExecutor('GET', (a) => `/${a.id}`));
toolRegistry.register(deleteResourceDesc, makeResourceExecutor('DELETE', (a) => `/${a.id}`));
toolRegistry.register(syncResourcesDesc, makeResourceExecutor('POST', () => '/sync', (a) => ({
  provider: a.provider,
  resourceType: a.resourceType,
})));

// Shell 执行
toolRegistry.register(shellExecuteDesc, async (args) => {
  const command = args.command as string;
  const timeoutSeconds = Math.min(Math.max((args.timeout as number) || 30, 1), 60);
  const timeout = timeoutSeconds * 1000;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
    });

    return JSON.stringify({
      success: true,
      command,
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: 0,
    });
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: true,
      command,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      exitCode: err.code || 1,
      message: `Shell命令执行失败: ${err.message}`,
    });
  }
});
