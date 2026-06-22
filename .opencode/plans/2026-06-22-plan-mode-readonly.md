# Plan Mode 只读限制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 模式下只允许执行只读（safe）工具，禁止执行任何修改性操作（moderate/dangerous）。

**Architecture:** 在后端 LLM 工具列表过滤和工具执行两个层面进行模式检查，同时在前端审批弹窗中对 Plan 模式下的非只读工具直接拒绝。

**Tech Stack:** TypeScript, React, Fastify

---

## 现状分析

当前 Plan 模式的行为：

| 层面 | 现状 | 问题 |
|------|------|------|
| LLM 工具过滤 | 仅移除 `shell_execute` | `cloud_delete_resource` 等危险工具仍可见 |
| 工具执行 | 仅 `shell_execute` 被阻止 | 危险工具可执行（需审批但不阻止） |
| 前端审批 | 非只读工具等待手动审批 | 用户仍可手动批准执行 |

## 期望行为

| 模式 | 只读工具 (safe) | 修改工具 (moderate) | 危险工具 (dangerous) |
|------|----------------|--------------------|--------------------|
| Plan | 自动批准 | 不提供给 LLM，执行时拒绝 | 不提供给 LLM，执行时拒绝 |
| Action | 自动批准 | 自动批准 | 自动批准 |
| Confirm | 手动审批 | 手动审批 | 手动审批 |

---

### Task 1: 后端 — LLM 工具列表过滤（Plan 模式仅暴露 safe 工具）

**Files:**
- Modify: `ai-gateway/src/agent/tools.ts:331-353` (`getLLMToolsForMode`)

- [ ] **Step 1: 修改 `getLLMToolsForMode` 函数**

在 `tools.ts` 中，将 `getLLMToolsForMode` 的过滤逻辑从"仅排除 shell_execute"改为"Plan 模式下仅包含 safe 工具"：

```typescript
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
      if (mode === 'plan') {
        // Plan 模式下仅提供只读（safe）工具
        return t.dangerLevel === 'safe';
      }
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
```

- [ ] **Step 2: 验证 LLM 工具列表**

重启服务后，Plan 模式下 LLM 只能看到 safe 工具：
- `cloud_list_instances` (safe) ✅
- `cloud_get_instance` (safe) ✅
- `cloud_list_resources` (safe) ✅
- `cloud_get_resource` (safe) ✅
- `monitor_get_metrics` (safe) ✅
- `monitor_list_alerts` (safe) ✅
- `monitor_get_cost` (safe) ✅
- `cloud_delete_resource` (dangerous) ❌ 不可见
- `cloud_create_instance` (dangerous) ❌ 不可见
- `cloud_delete_instance` (dangerous) ❌ 不可见
- `shell_execute` (dangerous) ❌ 不可见

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/src/agent/tools.ts
git commit -m "feat: Plan 模式仅暴露 safe 级别工具给 LLM"
```

---

### Task 2: 后端 — 工具执行层面的 Plan 模式安全检查

**Files:**
- Modify: `ai-gateway/src/agent/tools.ts:418-438` (`executeTool`)

- [ ] **Step 1: 在 `executeTool` 中添加 Plan 模式安全检查**

在 `executeTool` 函数中，将 `shell_execute` 的模式检查推广为通用检查：

```typescript
export async function executeTool(
  toolCall: ToolCall,
  authToken: string,
  mode?: ModeType
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  // Plan 模式下阻止所有非只读工具执行（防御性检查，正常情况下 LLM 不会调用）
  if (mode === 'plan') {
    const toolDef = findTool(name);
    if (toolDef && toolDef.dangerLevel !== 'safe') {
      return {
        name,
        success: false,
        data: null,
        error: `${toolDef.label || name} 在 Plan 模式下不可用，请切换到 Action 或 Confirm 模式`,
      };
    }
  }

  // Shell 执行工具需要模式检查（保留原有逻辑）
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

  // ... 其余工具执行逻辑不变
```

- [ ] **Step 2: 验证执行拦截**

重启服务后，在 Plan 模式下即使绕过 LLM 直接调用危险工具也会被拒绝。

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/src/agent/tools.ts
git commit -m "feat: Plan 模式下执行层面阻止非只读工具"
```

---

### Task 3: 前端 — Plan 模式下非只读工具自动拒绝

**Files:**
- Modify: `web-console/src/components/chat/ApprovalPrompt.tsx:44-60`

- [ ] **Step 1: 修改 `ApprovalPrompt.tsx` 的审批自动处理逻辑**

将 Plan 模式下非只读工具的行为从"等待手动审批"改为"自动拒绝"：

```typescript
  // 根据模式自动处理审批
  useEffect(() => {
    if (!approvals) return;
    for (const approval of approvals) {
      if (resolvedRef.current.has(approval.approvalId)) continue;

      if (mode === 'action') {
        resolvedRef.current.add(approval.approvalId);
        resolveApproval.mutate({ approvalId: approval.approvalId, decision: 'approve' });
      } else if (mode === 'plan') {
        if (isReadOnlyTool(approval.toolName)) {
          resolvedRef.current.add(approval.approvalId);
          resolveApproval.mutate({ approvalId: approval.approvalId, decision: 'approve' });
        } else {
          // Plan 模式下非只读工具直接拒绝
          resolvedRef.current.add(approval.approvalId);
          resolveApproval.mutate({ approvalId: approval.approvalId, decision: 'reject' });
        }
      }
      // Confirm 模式：不自动处理，等待手动审批
    }
  }, [approvals, mode, resolveApproval]);
```

- [ ] **Step 2: 验证前端行为**

重启前端后：
- Plan 模式下，safe 工具的审批自动批准
- Plan 模式下，非 safe 工具的审批自动拒绝（不会弹窗）
- Action 模式下，所有工具自动批准
- Confirm 模式下，所有工具需手动审批

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/chat/ApprovalPrompt.tsx
git commit -m "feat: Plan 模式下自动拒绝非只读工具审批"
```

---

### Task 4: 重建 Docker 并验证

- [ ] **Step 1: 重建 Docker 镜像**

```bash
docker compose build --no-cache
docker compose down && docker compose up -d
```

- [ ] **Step 2: 端到端验证**

1. 打开 `http://localhost`，登录 `admin` / `Admin123!`
2. 切换到 **Plan** 模式
3. 尝试让 AI 执行 "删除所有 Azure 资源"
   - 预期：LLM 不会调用 `cloud_delete_resource`（因为该工具不在 Plan 模式的工具列表中）
   - 预期：LLM 只会列出资源（使用 `cloud_list_resources`）并给出建议
4. 切换到 **Action** 模式
5. 再次让 AI 执行 "删除所有 Azure 资源"
   - 预期：LLM 会调用 `cloud_delete_resource`，自动批准并执行
6. 切换到 **Confirm** 模式
7. 让 AI 执行删除操作
   - 预期：弹出审批弹窗，需手动批准

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Plan 模式完整只读限制 - 后端过滤+执行拦截+前端拒绝"
```

---

## 变更总结

| 文件 | 变更内容 |
|------|---------|
| `ai-gateway/src/agent/tools.ts` | `getLLMToolsForMode`: Plan 模式仅返回 safe 工具 |
| `ai-gateway/src/agent/tools.ts` | `executeTool`: Plan 模式下阻止非 safe 工具执行 |
| `web-console/src/components/chat/ApprovalPrompt.tsx` | Plan 模式下自动拒绝非只读工具审批 |

## 风险点

- **向后兼容**：Action 和 Confirm 模式行为不变，仅影响 Plan 模式
- **LLM 行为**：Plan 模式下 LLM 无法执行修改操作，可能会以文本形式给出操作建议（符合预期）
- **防御性**：即使后端过滤被绕过，执行层也会阻止非 safe 工具
