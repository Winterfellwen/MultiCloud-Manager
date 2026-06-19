# CloudOps AI Phase 5.8 — 完善 AI 对话功能（fork OpenClaw + 扩展后端）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** fork OpenClaw 前端完整对话功能 + 扩展 ai-gateway 后端 RPC，实现 AI Provider 设置、附件上传、工具目录浏览、MCP 集成、斜杠命令、置顶消息等完整对话体验。

**核心策略：**
- 后端：扩展 ai-gateway，新增 `models.list`/`tools.catalog`/`commands.list`/`exec.approval` RPC，扩展 `chat.send` 参数（model/attachments/tools），集成 MCP 客户端
- 前端：fork OpenClaw 纯逻辑文件（直接复制），魔改渲染层（lit→React），重写耦合 OpenClaw 核心的模块

**OpenClaw 源码位置：** `/Users/xinruiwen/AI-Wen/openclaw/`

---

## 后端扩展（ai-gateway）

### Task 1: 扩展 chat.send 参数 + LLM 多模态

**Files:**
- `ai-gateway/src/methods/chat.ts` — 扩展 ChatSendParams
- `ai-gateway/src/agent/runner.ts` — 支持 model 覆盖 + attachments + 多模态 content
- `ai-gateway/src/llm/stream.ts` — 新建，支持多模态 content blocks（复用 ai-agent/src/llm/stream.ts 并扩展）
- `ai-gateway/src/config.ts` — 添加多 provider 配置

**ChatSendParams 扩展为：**
```typescript
{
  sessionKey: string;
  message: string;
  clientRunId?: string;
  model?: string;           // 模型覆盖（如 "openai/gpt-4o"）
  attachments?: Array<{     // 附件
    type: 'image' | 'file';
    mimeType: string;
    fileName?: string;
    content: string;        // base64
  }>;
  temperature?: number;     // 温度覆盖
  maxTokens?: number;       // 最大 token 覆盖
}
```

**LLM 多模态 content：** 当有图片附件时，content 改为 `[{type:'text',text}, {type:'image_url',image_url:{url:'data:...'}}]`

### Task 2: models.list RPC + 多 provider 配置

**Files:**
- `ai-gateway/src/methods/models.ts` — 新建，models.list handler
- `ai-gateway/src/config.ts` — 多 provider 配置（环境变量 LLM_PROVIDERS）
- `ai-gateway/src/index.ts` — 注册 models.list 路由

**models.list 返回：**
```typescript
{
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow?: number;
    reasoning?: boolean;
    input?: Array<'text'|'image'|'document'>;
    available?: boolean;
  }>
}
```

**配置方式：** 环境变量 `LLM_PROVIDERS` JSON 数组，每个 provider 含 `{id, name, baseUrl, apiKey, models: [{id,name,contextWindow}]}`

### Task 3: tools.catalog RPC + 工具动态注册

**Files:**
- `ai-gateway/src/methods/tools-catalog.ts` — 新建
- `ai-gateway/src/agent/tools.ts` — 改为动态注册（从 ai-agent 移植 ToolRegistry）
- `ai-gateway/src/index.ts` — 注册路由

**tools.catalog 返回：**
```typescript
{
  groups: Array<{
    id: string;
    label: string;
    tools: Array<{
      id: string;
      label: string;
      description: string;
      risk?: 'low'|'medium'|'high';
    }>;
  }>;
}
```

### Task 4: MCP 客户端集成

**Files:**
- `ai-gateway/src/mcp/client.ts` — 新建，MCP 客户端（stdio/http transport）
- `ai-gateway/src/mcp/registry.ts` — MCP 服务器注册表
- `ai-gateway/src/config.ts` — MCP 配置（环境变量 MCP_SERVERS）
- `ai-gateway/src/agent/tools.ts` — 合并 MCP 工具到工具注册表

**MCP 配置：**
```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "http-server": { "url": "http://localhost:8080/sse" }
  }
}
```

### Task 5: commands.list + exec.approval RPC

**Files:**
- `ai-gateway/src/methods/commands.ts` — 新建，斜杠命令列表
- `ai-gateway/src/methods/exec-approval.ts` — 新建，工具审批
- `ai-gateway/src/agent/runner.ts` — 危险工具调用前推送审批事件

---

## 前端完善（web-console）

### Task 6: fork OpenClaw 纯逻辑文件

**直接复制（零改动）：**
- `chat/attachment-support.ts` (11行)
- `chat/attachment-payload-store.ts` (103行)
- `chat/tool-helpers.ts` (37行) + `chat/constants.ts` (9行)
- `chat/pinned-messages.ts` (68行，替换 getSafeLocalStorage)
- `chat-model-ref.ts` (276行，纯函数)
- `types/chat-types.ts` (93行，类型)

**复制到：** `web-console/src/lib/openclaw/`

### Task 7: 工具卡片渲染（React 重写）

**Files:**
- `web-console/src/components/chat/ToolCard.tsx` — 重写（参考 OpenClaw tool-cards.ts 渲染逻辑）
- `web-console/src/lib/openclaw/tool-cards.ts` — 纯逻辑（extractToolCards 等）
- `web-console/src/lib/openclaw/tool-display.ts` — 精简版工具显示元数据

### Task 8: 附件上传 UI

**Files:**
- `web-console/src/components/chat/AttachmentPicker.tsx` — 文件选择/粘贴/拖拽
- `web-console/src/components/chat/AttachmentPreview.tsx` — 附件预览
- `web-console/src/stores/chat.ts` — 扩展支持 attachments

### Task 9: AI Provider 设置 UI

**Files:**
- `web-console/src/components/chat/ModelSelect.tsx` — 模型选择器
- `web-console/src/hooks/useModels.ts` — models.list hook
- `web-console/src/lib/openclaw/chat-model-ref.ts` — 复制的纯函数
- `web-console/src/lib/openclaw/chat-model-select-state.ts` — 复制的状态层

### Task 10: 斜杠命令 + 置顶消息

**Files:**
- `web-console/src/components/chat/SlashCommandMenu.tsx` — 命令补全菜单
- `web-console/src/lib/openclaw/slash-commands.ts` — 命令定义
- `web-console/src/lib/openclaw/pinned-messages.ts` — 置顶消息管理
- `web-console/src/components/chat/PinnedMessages.tsx` — 置顶消息 UI

### Task 11: 工具目录 + MCP 配置 UI

**Files:**
- `web-console/src/pages/ToolsCatalog.tsx` — 工具目录浏览页
- `web-console/src/pages/McpConfig.tsx` — MCP 服务器配置页
- `web-console/src/hooks/useToolsCatalog.ts`

### Task 12: 审批 UI

**Files:**
- `web-console/src/components/chat/ApprovalPrompt.tsx` — 审批弹窗
- `web-console/src/hooks/useExecApproval.ts`

### Task 13: 端到端验证 + commit

---

## 验收标准

1. ✅ ai-gateway 新增 5 个 RPC 方法
2. ✅ chat.send 支持 model/attachments/temperature 参数
3. ✅ MCP 工具集成到工具注册表
4. ✅ 前端工具卡片渲染（展开/折叠/错误）
5. ✅ 附件上传（粘贴/拖拽/预览）
6. ✅ 模型选择器
7. ✅ 斜杠命令补全
8. ✅ 置顶消息
9. ✅ 工具目录浏览
10. ✅ MCP 配置 UI
11. ✅ 审批弹窗
