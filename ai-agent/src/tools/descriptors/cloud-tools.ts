// 云资源操作工具描述符 + 执行器（对应设计文档 5.2 节）

import { toolRegistry, type ToolExecutor, type ToolExecutionContext } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

const listInstancesDesc: ToolDescriptor = {
  name: 'cloud_list_instances',
  description: '列出云服务器实例。支持按云厂商(provider)、区域(region)、状态(status)过滤。返回实例列表（id、名称、云厂商、区域、状态、IP、规格）。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商: aws | aliyun | azure | tencent | oracle | render' },
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
      instanceId: { type: 'string', description: '实例 ID' },
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
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
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
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_stop_instance' },
  sortKey: '04',
  dangerLevel: 'dangerous',
};

const rebootInstanceDesc: ToolDescriptor = {
  name: 'cloud_reboot_instance',
  description: '重启一台云服务器实例。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_reboot_instance' },
  sortKey: '05',
  dangerLevel: 'dangerous',
};

const createInstanceDesc: ToolDescriptor = {
  name: 'cloud_create_instance',
  description: '创建一台新的云服务器实例。需要指定云厂商、区域、规格。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商: aws | aliyun | azure' },
      region: { type: 'string', description: '区域' },
      instanceType: { type: 'string', description: '规格，如 t3.micro, ecs.t6-c1m2' },
      name: { type: 'string', description: '实例名称' },
    },
    required: ['provider', 'region', 'instanceType'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_create_instance' },
  sortKey: '06',
  dangerLevel: 'moderate',
};

const deleteInstanceDesc: ToolDescriptor = {
  name: 'cloud_delete_instance',
  description: '删除一台云服务器实例。⚠️ 此操作不可逆，实例及其数据将被永久删除。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_delete_instance' },
  sortKey: '07',
  dangerLevel: 'dangerous',
};

function makeCloudExecutor(method: string, pathBuilder: (args: Record<string, unknown>) => string, bodyBuilder?: (args: Record<string, unknown>) => Record<string, unknown> | undefined): ToolExecutor {
  return async (args, ctx: ToolExecutionContext) => {
    const path = pathBuilder(args);
    const url = `${ctx.cloudServiceUrl}/cloud/instances${path}`;
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
      return JSON.stringify({ error: true, status: res.status, message: data.message || data.error });
    }
    return JSON.stringify(data);
  };
}

toolRegistry.register(listInstancesDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.region) params.set('region', args.region as string);
  if (args.status) params.set('status', args.status as string);
  const res = await fetch(`${ctx.cloudServiceUrl}/cloud/instances?${params}`, {
    headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {},
  });
  return JSON.stringify(await res.json());
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
