# Cloud API 化改造 + Shell 沙箱化

## 目标

用云厂商 SDK API 替代 shell 命令执行，同时保留沙箱化 shell 作为最终 fallback，彻底隔离 AI 与云凭证。

## 架构设计

```
AI Agent
  │
  ├─ 优先: cloud_xxx_* 工具 (调用 cloud-service API)
  │         → cloud-service → 各云厂商 SDK → 云 API
  │
  ├─ 灵活: cloud_service_call (通用 API 调用)
  │         → cloud-service HTTP 路由
  │
  └─ 兜底: shell_execute (沙箱化)
            → 剥离所有敏感 env vars
            → 拦截凭证提取命令
            → 非 root 用户执行
```

## 实现步骤

### Step 1: 扩展 deleteResource (cloud-service)

#### 1.1 Azure (`cloud-service/src/providers/azure/index.ts`)

**现有 deleteResource (line 314-319)**: 只支持 instance 和 aiservice

**新增删除方法**:

```typescript
// 新增 parseArmId 辅助方法 (从 ARM ID 提取 resourceGroup 和 name)
private parseArmId(armId: string): { resourceGroup: string; name: string } | null {
  const rgMatch = armId.match(/resourceGroups\/([^/]+)/i);
  const nameMatch = armId.match(/\/([^/]+)$/);
  if (rgMatch && nameMatch) {
    return { resourceGroup: rgMatch[1], name: nameMatch[1] };
  }
  return null;
}

// 新增 deleteDisk (line ~314)
private async deleteDisk(id: string): Promise<void> {
  const parsed = this.parseArmId(id);
  if (parsed) {
    await this.client.disks.beginDeleteAndWait(parsed.resourceGroup, parsed.name);
  } else {
    for await (const disk of this.client.disks.list()) {
      if (disk.name === id && disk.id) {
        const rg = disk.id.match(/resourceGroups\/([^/]+)/i)?.[1];
        if (rg) { await this.client.disks.beginDeleteAndWait(rg, id); return; }
      }
    }
    throw new Error(`Disk ${id} not found`);
  }
}

// 新增 deleteDatabase
private async deleteDatabase(id: string): Promise<void> {
  const client = new PostgreSQLManagementFlexibleServerClient(this.credential, this.subscriptionId);
  const parsed = this.parseArmId(id);
  if (parsed) {
    await client.servers.beginDeleteAndWait(parsed.resourceGroup, parsed.name);
  } else {
    for await (const server of client.servers.listBySubscription()) {
      if (server.name === id && server.id) {
        const rg = server.id.match(/resourceGroups\/([^/]+)/i)?.[1];
        if (rg) { await client.servers.beginDeleteAndWait(rg, id); return; }
      }
    }
    throw new Error(`Database ${id} not found`);
  }
}

// 新增 deleteCache
private async deleteCache(id: string): Promise<void> {
  const client = new RedisManagementClient(this.credential, this.subscriptionId);
  const parsed = this.parseArmId(id);
  if (parsed) {
    await client.redis.beginDeleteAndWait(parsed.resourceGroup, parsed.name);
  } else {
    for await (const redis of client.redis.listBySubscription()) {
      if (redis.name === id && redis.id) {
        const rg = redis.id.match(/resourceGroups\/([^/]+)/i)?.[1];
        if (rg) { await client.redis.beginDeleteAndWait(rg, id); return; }
      }
    }
    throw new Error(`Cache ${id} not found`);
  }
}

// 新增 deleteLoadBalancer
private async deleteLoadBalancer(id: string): Promise<void> {
  const client = new NetworkManagementClient(this.credential, this.subscriptionId);
  const parsed = this.parseArmId(id);
  if (parsed) {
    await client.loadBalancers.beginDeleteAndWait(parsed.resourceGroup, parsed.name);
  } else {
    for await (const lb of client.loadBalancers.listAll()) {
      if (lb.name === id && lb.id) {
        const rg = lb.id.match(/resourceGroups\/([^/]+)/i)?.[1];
        if (rg) { await client.loadBalancers.beginDeleteAndWait(rg, id); return; }
      }
    }
    throw new Error(`Load balancer ${id} not found`);
  }
}

// 更新 deleteResource switch
async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
  switch (resourceType) {
    case 'instance': return this.deleteInstance(id);
    case 'disk': return this.deleteDisk(id);
    case 'database': return this.deleteDatabase(id);
    case 'cache': return this.deleteCache(id);
    case 'loadbalancer': return this.deleteLoadBalancer(id);
    case 'aiservice': return this.deleteCognitiveService(id);
    default: throw new Error(`Delete ${resourceType} not implemented for Azure`);
  }
}
```

**已导入的 SDK** (无需新增):
- `ComputeManagementClient` → `disks.beginDeleteAndWait`
- `PostgreSQLManagementFlexibleServerClient` → `servers.beginDeleteAndWait`
- `RedisManagementClient` → `redis.beginDeleteAndWait`
- `NetworkManagementClient` → `loadBalancers.beginDeleteAndWait`

#### 1.2 AWS (`cloud-service/src/providers/aws/index.ts`)

**现有 deleteResource (line 402-417)**: 支持 instance, disk, bucket

**新增导入**:
```typescript
import { DeleteDBInstanceCommand } from "@aws-sdk/client-rds";
import { DeleteCacheClusterCommand } from "@aws-sdk/client-elasticache";
```

**新增删除方法**:

```typescript
// 新增 deleteDatabase
private async deleteDatabase(id: string): Promise<void> {
  const rds = new RDSClient({ region: this.defaultRegion, credentials: this.credentials });
  await rds.send(new DeleteDBInstanceCommand({
    DBInstanceIdentifier: id,
    SkipFinalSnapshot: true,
  }));
}

// 新增 deleteCache
private async deleteCache(id: string): Promise<void> {
  const client = new ElastiCacheClient({ region: this.defaultRegion, credentials: this.credentials });
  await client.send(new DeleteCacheClusterCommand({
    CacheClusterId: id,
  }));
}

// 更新 deleteResource switch
async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
  switch (resourceType) {
    case 'instance': return this.deleteInstance(id);
    case 'disk': { /* 现有代码 */ }
    case 'bucket': { /* 现有代码 */ }
    case 'database': return this.deleteDatabase(id);
    case 'cache': return this.deleteCache(id);
    default: throw new Error(`Delete ${resourceType} not implemented for AWS`);
  }
}
```

#### 1.3 Aliyun (`cloud-service/src/providers/aliyun/index.ts`)

**现有 deleteResource (line 346-356)**: 只支持 instance

**新增导入**:
```typescript
import { DeleteDiskRequest } from "@alicloud/ecs20140526";
```

**新增删除方法**:

```typescript
// 新增 deleteDisk
private async deleteDisk(id: string, region?: string): Promise<void> {
  const regionId = region || this.defaultRegion;
  const client = this.createClient(regionId);
  const request = new DeleteDiskRequest({ diskId: id });
  await client.deleteDiskWithOptions(request, new RuntimeOptions({}));
}

// 更新 deleteResource switch
async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
  switch (resourceType) {
    case 'instance': return this.deleteInstance(id);
    case 'disk': return this.deleteDisk(id);
    default: throw new Error(`Delete ${resourceType} not implemented for aliyun`);
  }
}
```

### Step 2: 新增 cloud_service_call 通用工具 (ai-gateway)

**文件**: `ai-gateway/src/agent/tools.ts`

```typescript
// 新增工具定义 (line ~278)
{
  name: 'cloud_service_call',
  label: '调用云服务API',
  description: '直接调用 cloud-service HTTP API。支持 GET/POST/PUT/DELETE 方法。路径必须以 /cloud/ 或 /monitor/ 开头。',
  dangerLevel: 'safe',
  group: 'cloud',
  parameters: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP 方法' },
      path: { type: 'string', description: 'API 路径，如 /cloud/resources?resourceType=disk' },
      body: { type: 'object', description: '请求体（仅 POST/PUT 时需要）' },
    },
    required: ['method', 'path'],
  },
}

// 新增执行函数 (line ~415)
async function executeCloudServiceCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ToolResult> {
  const cloudServiceUrl = config.cloudServiceUrl || 'http://localhost:3001';

  // 安全校验：只允许 /cloud/ 和 /monitor/ 路径
  if (!path.startsWith('/cloud/') && !path.startsWith('/monitor/')) {
    return { success: false, error: '安全限制：只允许 /cloud/ 和 /monitor/ 路径' };
  }

  const url = `${cloudServiceUrl}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${data.error || data.message || 'Unknown error'}`,
      };
    }

    return {
      success: true,
      data,
      message: JSON.stringify(data, null, 2),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 在 executeTool 中添加分发 (line ~496)
case 'cloud_service_call':
  return executeCloudServiceCall(
    args.method as string,
    args.path as string,
    args.body as Record<string, unknown> | undefined
  );
```

### Step 3: Shell 沙箱化

#### 3.1 Dockerfile 修改

```dockerfile
# 在 RUN pm2 save 之后添加
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox

# 创建沙箱脚本
RUN cat > /usr/local/bin/sandbox-shell.sh << 'SANDBOX_EOF'
#!/bin/sh
# 剥离所有敏感环境变量
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_SUBSCRIPTION_ID
unset ALIYUN_ACCESS_KEY_ID ALIYUN_ACCESS_KEY_SECRET
unset TENCENT_SECRET_ID TENCENT_SECRET_KEY
unset HUAWEI_ACCESS_KEY HUAWEI_SECRET_KEY
unset DATABASE_URL REDIS_URL JWT_SECRET JWT_EXPIRES_IN
unset LLM_API_KEY LLM_BASE_URL LLM_MODEL
unset ADMIN_USERNAME ADMIN_PASSWORD

# 拦截凭证提取命令
BLOCKED_PATTERNS="env$|printenv|^set$|^export |cat.*/proc/.*/environ|cat.*/etc/shadow|curl.*169\.254\.169\.254|wget.*169\.254\.169\.254"
CMD="$1"
shift 2>/dev/null
FULL_CMD="$CMD $*"
if echo "$FULL_CMD" | grep -qE "$BLOCKED_PATTERNS"; then
  echo "Error: 此命令被安全策略禁止（禁止读取环境变量或凭证）" >&2
  exit 1
fi

exec /bin/sh -c "$FULL_CMD"
SANDBOX_EOF
chmod +x /usr/local/bin/sandbox-shell.sh
```

#### 3.2 修改 shell_execute (`ai-gateway/src/agent/tools.ts`)

```typescript
// 修改 executeShell 函数 (line 376)
async function executeShell(command: string, timeoutSeconds: number = 30): Promise<ToolResult> {
  const timeout = Math.min(Math.max(timeoutSeconds, 1), 60) * 1000;

  // 安全校验：拦截高危命令
  const blockedPatterns = [
    /\benv\b/, /\bprintenv\b/, /\bset\b/,
    /\bexport\s+\w*(KEY|SECRET|TOKEN|PASSWORD)/i,
    /cat\s+\/proc\/.*\/environ/,
    /curl.*169\.254\.169\.254/,
    /wget.*169\.254\.169\.254/,
    /\baz\s+(login|account|keyvault|ad)/,
    /\baws\s+(configure|sts|iam)/,
    /\baliyun\s+(configure|sts)/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(command)) {
      return {
        success: false,
        error: `命令被安全策略禁止: 匹配规则 ${pattern}。如需执行云操作，请使用 cloud_xxx_* 工具。`,
      };
    }
  }

  try {
    // 使用沙箱环境：空 env + 白名单变量
    const safeEnv: Record<string, string> = {
      LANG: 'en_US.UTF-8',
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: '/tmp',
    };
    // 只传递服务间通信 URL（非敏感）
    if (process.env.CLOUD_SERVICE_URL) safeEnv.CLOUD_SERVICE_URL = process.env.CLOUD_SERVICE_URL;
    if (process.env.MONITOR_SERVICE_URL) safeEnv.MONITOR_SERVICE_URL = process.env.MONITOR_SERVICE_URL;
    if (process.env.AUTH_SERVICE_URL) safeEnv.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: safeEnv,
    });

    const output = (stdout || '').trim();
    const errorOutput = (stderr || '').trim();

    if (!output && errorOutput) {
      return { success: false, error: errorOutput };
    }

    return {
      success: true,
      data: { stdout: output, stderr: errorOutput },
      message: output || '(命令执行完成，无输出)',
    };
  } catch (error: any) {
    if (error.killed) {
      return { success: false, error: `命令执行超时（${timeout / 1000}秒）` };
    }
    return { success: false, error: error.message || '命令执行失败' };
  }
}
```

### Step 4: 更新 AI 系统提示 (`ai-gateway/src/agent/runner.ts`)

```typescript
plan: `当前模式：Plan（只读分析模式）
所有工具可用，修改性操作仅做分析建议不会实际执行...
重要规则：
1. 所有操作只读，通过 cloud-service API 查询。
2. 禁止调用 shell_execute。
3. 可以使用 cloud_service_call 查询任意 cloud-service 路由。`,

action: `当前模式：Action（自动执行模式）
所有工具可用，修改性操作将自动执行（无需审批）...
重要规则：
1. 优先使用 cloud_xxx_* 工具完成所有操作。
2. 如果 cloud_xxx_* 工具不支持某操作，使用 cloud_service_call 调用 cloud-service API。
3. 只有在所有 API 方案都失败后，才考虑使用 shell_execute。
4. shell_execute 仅用于执行非云相关的系统命令（如 ls, cat, grep 等）。
5. 禁止在 shell 中执行任何云 CLI 命令（az, aws, aliyun, kubectl 等）。
6. 禁止在 shell 中读取任何环境变量。`,

confirm: `当前模式：Confirm（确认模式）
所有工具可用，修改性操作需要用户逐次审批确认后才会执行...
重要规则：
1. 用户确认后工具才会执行，可以正常调用所有工具。
2. 工具优先级同 Action 模式：cloud_xxx_* > cloud_service_call > shell_execute。
3. 禁止在 shell 中执行云 CLI 命令或读取环境变量。`,
```

### Step 5: 测试验证

1. **deleteResource 测试**:
   - 测试 Azure: 删除 disk/database/cache/loadbalancer
   - 测试 AWS: 删除 database/cache
   - 测试 Aliyun: 删除 disk

2. **cloud_service_call 测试**:
   - GET /cloud/resources?resourceType=disk
   - GET /cloud/instances
   - 验证路径限制：尝试 /etc/passwd 应被拒绝

3. **Shell 沙箱测试**:
   - 执行 `env` 应被拦截
   - 执行 `printenv AWS_ACCESS_KEY_ID` 应被拦截
   - 执行 `cat /proc/1/environ` 应被拦截
   - 执行 `ls /tmp` 应正常通过
   - 执行 `echo $DATABASE_URL` 应返回空（环境变量已剥离）

4. **AI 工具选择测试**:
   - Plan 模式：AI 应只使用 cloud_xxx_* 和 cloud_service_call，不调用 shell
   - Action 模式：AI 应优先使用 cloud_xxx_*，不执行云 CLI
   - 验证 AI 不再尝试通过 shell 操作云资源

## 安全保障

| 层 | 防护 |
|----|------|
| LLM 工具列表 | Plan 模式不暴露 shell_execute |
| 系统提示 | 指导 AI 优先使用 API 工具 |
| 工具执行层 | 拦截高危命令模式 |
| 沙箱环境 | 剥离所有敏感 env vars |
| 沙箱用户 | 非 root 用户执行 |
| 无 CLI 容器 | Docker 镜像不安装 az/aws/aliyun CLI |
| 路径限制 | cloud_service_call 只允许 /cloud/ 和 /monitor/ 路径 |
