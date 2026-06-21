# Tools Expansion & Shell Execution Design

## Problem

1. **Tool parameter mismatch** between ai-gateway and ai-agent (id vs instanceId, missing region)
2. **Provider list incomplete** — gateway only lists aws/aliyun/azure, system supports 5 providers
3. **No resource management tools** — only instance CRUD, missing disk/database/cache/vpc/etc
4. **No shell execution** — AI cannot run arbitrary commands when tools are insufficient

## Part 1: Fix Existing Instance Tools

### Changes to `ai-gateway/src/agent/tools.ts`

Unify tool parameter names and descriptions:

| Tool | Current Issue | Fix |
|------|--------------|-----|
| `cloud_get_instance` | Uses `id` | Add `id` as alias, keep compatible |
| `cloud_start_instance` | Uses `id` | Same |
| `cloud_stop_instance` | Uses `id` | Same |
| `cloud_reboot_instance` | Uses `id` | Same |
| `cloud_delete_instance` | Uses `id` | Same |
| `cloud_list_instances` | Missing `region` | Add `region` param |
| `cloud_create_instance` | Uses `flavor` instead of `instanceType`, missing `region`/`imageId` | Fix params |

Provider list in descriptions: `aws | aliyun | azure | tencent | huawei`

### Changes to `ai-agent/src/tools/descriptors/cloud-tools.ts`

Align parameter names with ai-gateway (use `id` instead of `instanceId`) and update provider lists.

## Part 2: Add Resource Management Tools

New tool group `cloud-resources` in ai-gateway:

| Tool Name | Description | Danger Level | Parameters |
|-----------|-------------|-------------|------------|
| `cloud_list_resources` | 列出云资源（磁盘/数据库/缓存/VPC等） | safe | `provider?`, `resourceType?`, `region?`, `status?`, `search?` |
| `cloud_get_resource` | 查看资源详情 | safe | `id` (required) |
| `cloud_delete_resource` | 删除资源 | dangerous | `id` (required) |
| `cloud_sync_resources` | 触发资源同步 | moderate | `provider?`, `resourceType?` |

Resource types: `instance | disk | bucket | database | cache | loadbalancer | vpc | securitygroup | cdn | cluster | aiservice`

### Backend API mapping

All already exist in cloud-service:
- `GET /cloud/resources` → `cloud_list_resources`
- `GET /cloud/resources/:id` → `cloud_get_resource`
- `DELETE /cloud/resources/:id` → `cloud_delete_resource`
- `POST /cloud/resources/sync` → `cloud_sync_resources`

## Part 3: Shell Execution Tool

### Tool definition

```typescript
{
  name: 'shell_execute',
  label: '执行Shell命令',
  description: '在服务器上执行Shell命令（仅Action/Confirm模式可用）',
  dangerLevel: 'dangerous',
  group: 'system',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的Shell命令' },
      timeout: { type: 'number', description: '超时时间(秒)，默认30' },
    },
    required: ['command'],
  },
}
```

### Mode behavior

| Mode | Behavior |
|------|----------|
| Plan | 工具不可用（不注册到LLM tools列表） |
| Action | 直接执行，无需审批 |
| Confirm | 需要人工审批后执行 |

### Implementation

- New file: `ai-gateway/src/agent/shell-executor.ts`
- Uses Node.js `child_process.exec` with timeout
- Returns `{ stdout, stderr, exitCode, duration }`
- Command allowlist/blocksellist configurable via env vars
- Max timeout: 60 seconds

### Mode integration

The `getLLMTools()` function and tool execution logic in `runner.ts` need to check the current session mode:
- Plan mode: filter out `shell_execute` from tools list
- Action mode: execute directly
- Confirm mode: route through approval flow

## Part 4: Unified Tool Registration

### ai-gateway tool groups (updated)

```
cloud:          7 tools (instance CRUD)
cloud-resources: 4 tools (resource list/get/delete/sync)
monitor:        3 tools (metrics/alerts/cost)
system:         1 tool  (shell_execute)
```

### ai-agent tool descriptors

Same tools, aligned parameter names.

## Files to modify

1. `ai-gateway/src/agent/tools.ts` — fix existing + add resource tools + shell tool
2. `ai-agent/src/tools/descriptors/cloud-tools.ts` — fix parameter alignment
3. `ai-gateway/src/agent/runner.ts` — mode-aware tool filtering + shell execution
4. `ai-gateway/src/agent/shell-executor.ts` — new file, shell execution logic
5. `ai-gateway/src/config.ts` — add shell config options
6. `.env.simple` / `docker-compose.simple.yml` — add shell config env vars
