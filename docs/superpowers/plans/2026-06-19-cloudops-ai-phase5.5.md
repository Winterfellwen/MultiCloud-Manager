# CloudOps AI Phase 5.5 — AI 对话页 OpenClaw Lit 版（fork + 魔改 + 嵌入）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fork OpenClaw Lit 前端的关键模块，魔改后构建为 `<cloudops-chat>` Web Component，嵌入 React 的 ChatLit.tsx 页面，实现与 Phase 5.4 React 版功能对等的 AI 对话页。

**Architecture:** 在 web-console 下创建 `openclaw-ui/` 子项目（独立 package.json + Vite + Lit），从 OpenClaw 源码复制可用模块（i18n/styles/chat 纯逻辑），魔改 gateway.ts 和 controllers/chat.ts（移除设备配对/ed25519/agent 作用域），重写聊天页面为精简 Lit 组件。构建产物为单个 JS bundle，React 通过 `<cloudops-chat>` 自定义元素嵌入。

**Tech Stack:** Lit 3 / TypeScript / Vite / markdown-it / 原生 WebSocket

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

**OpenClaw 源码位置：** `/Users/xinruiwen/AI-Wen/openclaw/ui/`

---

## OpenClaw 前端复用性调研结论

### 可直接复制（零风险）

| 源文件 | 用途 | 复制目标 |
|--------|------|---------|
| `chat/stream-text.ts` (7行) | 流式前缀裁剪纯函数 | `openclaw-ui/src/chat/stream-text.ts` |
| `chat/message-extract.ts` | 消息文本提取 | `openclaw-ui/src/chat/message-extract.ts` |
| `chat/message-normalizer.ts` | 消息规范化 | `openclaw-ui/src/chat/message-normalizer.ts` |
| `chat/role-normalizer.ts` | 角色规范化 | `openclaw-ui/src/chat/role-normalizer.ts` |
| `chat/heartbeat-display.ts` | 心跳过滤 | `openclaw-ui/src/chat/heartbeat-display.ts` |
| `chat/history-limits.ts` | 历史截断 | `openclaw-ui/src/chat/history-limits.ts` |
| `chat/stream-reconciliation.ts` | 流式状态物化 | `openclaw-ui/src/chat/stream-reconciliation.ts` |
| `chat/session-message-cache.ts` | 会话消息缓存 | `openclaw-ui/src/chat/session-message-cache.ts` |
| `chat/run-lifecycle.ts` | run 生命周期 | `openclaw-ui/src/chat/run-lifecycle.ts` |
| `i18n/` 整个目录 | 国际化体系 | `openclaw-ui/src/i18n/` |
| `styles/base.css` | CSS 变量体系 | `openclaw-ui/src/styles/base.css` |
| `styles/chat/` | 聊天样式 | `openclaw-ui/src/styles/chat/` |

### 需魔改（中等风险）

| 源文件 | 行数 | 魔改要点 |
|--------|------|---------|
| `gateway.ts` | 1051 | 抽取 WebSocket 核心，移除设备身份/ed25519/配对，替换为 JWT 认证 |
| `controllers/chat.ts` | 1385 | 裁剪 ChatState，移除 agent 作用域/skill workshop，简化 session-key |
| `chat/tool-cards.ts` | 874 | 纯逻辑函数直接用，渲染函数替换 icons/i18n |
| `chat/build-chat-items.ts` | 856 | 移除 `__openclaw` 元数据标记 |

### 必须重写（参考蓝图）

| 源文件 | 行数 | 原因 |
|--------|------|------|
| `app-gateway.ts` | 1439 | 聚合 50+ 字段根状态 + 15 事件路由，是 OpenClaw 中枢 |
| `views/chat.ts` | 2737 | 聚合 30+ 模块，含 realtime-talk/slash-commands 等专有功能 |

---

## 文件结构总览

```
web-console/
├── openclaw-ui/                        # fork 的 OpenClaw Lit 前端（独立子项目）
│   ├── package.json                    # Lit 3 + Vite + markdown-it
│   ├── tsconfig.json
│   ├── vite.config.ts                  # 构建为 Web Component bundle
│   ├── src/
│   │   ├── main.ts                     # 入口：注册 <cloudops-chat> 自定义元素
│   │   ├── cloudops-chat.ts            # <cloudops-chat> Lit 组件（重写，参考 views/chat.ts）
│   │   ├── gateway-client.ts           # WebSocket 客户端（魔改自 gateway.ts，JWT 认证）
│   │   ├── chat-controller.ts          # 聊天控制器（魔改自 controllers/chat.ts）
│   │   ├── chat/                       # 从 OpenClaw 复制的纯逻辑工具
│   │   │   ├── stream-text.ts          # 直接复制
│   │   │   ├── message-extract.ts      # 直接复制
│   │   │   ├── message-normalizer.ts   # 直接复制
│   │   │   ├── role-normalizer.ts      # 直接复制
│   │   │   ├── heartbeat-display.ts    # 直接复制
│   │   │   ├── history-limits.ts       # 直接复制
│   │   │   ├── stream-reconciliation.ts # 直接复制
│   │   │   ├── session-message-cache.ts # 直接复制
│   │   │   ├── run-lifecycle.ts        # 直接复制
│   │   │   ├── build-chat-items.ts     # 魔改（移除 __openclaw 标记）
│   │   │   └── tool-cards.ts           # 魔改（纯逻辑保留，渲染重写）
│   │   ├── i18n/                       # 从 OpenClaw 复制（裁剪翻译 key）
│   │   │   ├── index.ts
│   │   │   └── locales/en.ts
│   │   ├── styles/                     # 从 OpenClaw 复制
│   │   │   ├── base.css
│   │   │   └── chat.css
│   │   └── types.ts                    # CloudOps 协议类型（对齐 web-console/src/types/chat.ts）
│   └── dist/                           # 构建产物（cloudops-chat.js）
├── src/
│   ├── pages/ChatLit.tsx               # React 页面（替换占位）：嵌入 <cloudops-chat>
│   └── lib/openclaw-adapter.ts         # Web Component 适配（动态加载 bundle + 传参）
```

---

## Task 1: Lit 子项目初始化

**Files:**
- `web-console/openclaw-ui/package.json`
- `web-console/openclaw-ui/tsconfig.json`
- `web-console/openclaw-ui/vite.config.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@cloudops/openclaw-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lit": "3.3.3",
    "markdown-it": "14.2.0"
  },
  "devDependencies": {
    "@types/markdown-it": "14.1.2",
    "typescript": "5.4.5",
    "vite": "5.4.21"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": false,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "experimentalDecorators": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 vite.config.ts**

构建为 IIFE bundle（Web Component），文件名 `cloudops-chat.js`。

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'CloudOpsChat',
      formats: ['iife'],
      fileName: () => 'cloudops-chat.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

---

## Task 2: WebSocket 客户端（魔改自 gateway.ts）

**Files:**
- `web-console/openclaw-ui/src/types.ts`
- `web-console/openclaw-ui/src/gateway-client.ts`

- [ ] **Step 1: 创建 src/types.ts**

对齐 web-console/src/types/chat.ts 的协议类型（WsReqFrame/WsResFrame/WsEventFrame/chat 事件 payload 等）。

- [ ] **Step 2: 创建 src/gateway-client.ts**

从 OpenClaw `gateway.ts` 抽取核心 WebSocket 逻辑，移除：
- 设备身份（loadOrCreateDeviceIdentity / signDevicePayload）
- ed25519 签名
- 设备令牌存储（loadDeviceAuthToken / storeDeviceAuthToken）
- 配对错误处理（shouldContinueReconnectForPairingRequired）
- 挑战 nonce（connect.challenge）
- operator role / scopes

保留：
- WebSocket 连接/关闭/重连退避（指数退避）
- 请求/响应 Promise 映射（pending Map + 超时）
- seq gap 检测（lastSeq + onGap 回调）
- hello-ok 等待
- 事件监听器注册

认证改为：URL query `?token=<JWT>`，与 ai-gateway 的 `src/auth.ts` 对接。

---

## Task 3: 聊天控制器（魔改自 controllers/chat.ts）

**Files:**
- `web-console/openclaw-ui/src/chat-controller.ts`
- `web-console/openclaw-ui/src/chat/` 目录（从 OpenClaw 复制 + 魔改）

- [ ] **Step 1: 复制 chat/ 纯逻辑工具文件**

从 `/Users/xinruiwen/AI-Wen/openclaw/ui/src/ui/chat/` 复制以下文件到 `openclaw-ui/src/chat/`：
- `stream-text.ts`（直接复制）
- `message-extract.ts`（直接复制）
- `message-normalizer.ts`（直接复制）
- `role-normalizer.ts`（直接复制）
- `heartbeat-display.ts`（直接复制）
- `history-limits.ts`（直接复制）
- `stream-reconciliation.ts`（直接复制）
- `session-message-cache.ts`（直接复制）
- `run-lifecycle.ts`（直接复制）
- `build-chat-items.ts`（魔改：移除 `__openclaw` 元数据标记）
- `tool-cards.ts`（魔改：保留纯逻辑函数，移除 lit 渲染依赖）

- [ ] **Step 2: 创建 src/chat-controller.ts**

从 OpenClaw `controllers/chat.ts` 抽取核心逻辑，移除：
- agent 作用域匹配（resolveSelectedAgentId / resolveDefaultAgentId / chatEventAgentScopeMatches）
- skill workshop（requestSkillWorkshopRevisionChatSend）
- operator 权限错误（isMissingOperatorReadScopeError）
- chat.startup 方法分支
- 附件构造（attachment-payload-store）

保留：
- loadChatHistory（chat.history 方法 + 重试 + 乐观尾保留）
- sendChatMessage（chat.send 方法 + 幂等键）
- abortChatRun（chat.abort 方法）
- handleChatEvent（delta 增量合并 + final/aborted/error 终态）
- resolveDeltaChatStreamText（增量文本合并算法）

---

## Task 4: `<cloudops-chat>` Lit 组件（重写，参考 views/chat.ts）

**Files:**
- `web-console/openclaw-ui/src/cloudops-chat.ts`
- `web-console/openclaw-ui/src/main.ts`
- `openclaw-ui/src/styles/base.css`（从 OpenClaw 复制）
- `openclaw-ui/src/styles/chat.css`（从 OpenClaw 复制）

- [ ] **Step 1: 复制 styles**

从 `/Users/xinruiwen/AI-Wen/openclaw/ui/src/styles/` 复制 `base.css` 和 `chat/` 目录，调整 CSS 变量值适配 CloudOps 主题。

- [ ] **Step 2: 创建 src/cloudops-chat.ts**

参考 OpenClaw `views/chat.ts` 的结构，重写为精简 Lit 组件：

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { GatewayClient } from './gateway-client';
import { ChatController } from './chat-controller';

@customElement('cloudops-chat')
export class CloudOpsChat extends LitElement {
  @property() gatewayUrl = '';
  @property() token = '';

  @state() private messages: ChatMessage[] = [];
  @state() private inputText = '';
  @state() private isSending = false;
  @state() private connectionStatus = 'disconnected';

  // ... 生命周期 + 渲染逻辑
}
```

功能：
- 会话列表侧边栏（新建/切换）
- 消息流（流式渲染 + Markdown）
- 工具卡片（可展开）
- 输入框 + 发送 + 中止
- 连接状态指示
- 断线恢复（chat.history + inFlightRun）

- [ ] **Step 3: 创建 src/main.ts**

```typescript
import './cloudops-chat';
```

---

## Task 5: React 集成

**Files:**
- `web-console/src/lib/openclaw-adapter.ts`
- `web-console/src/pages/ChatLit.tsx`

- [ ] **Step 1: 创建 src/lib/openclaw-adapter.ts**

动态加载 `openclaw-ui/dist/cloudops-chat.js`，注册自定义元素。

```typescript
let loaded = false;

export async function loadCloudOpsChat(): Promise<void> {
  if (loaded) return;
  await import(/* @vite-ignore */ '/openclaw-ui/dist/cloudops-chat.js');
  loaded = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'cloudops-chat': HTMLElement;
  }
}
```

- [ ] **Step 2: 创建 src/pages/ChatLit.tsx（替换占位）**

```typescript
import { useEffect, useRef, useState } from 'react';
import { loadCloudOpsChat } from '@/lib/openclaw-adapter';
import { useAuthStore } from '@/stores/auth';
import { Loader2 } from 'lucide-react';

export default function ChatLit() {
  const [loaded, setLoaded] = useState(false);
  const token = useAuthStore((s) => s.accessToken);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCloudOpsChat().then(() => setLoaded(true));
  }, []);

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      {loaded ? (
        <cloudops-chat
          ref={containerRef}
          gateway-url={import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3005/ws'}
          token={token || ''}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
```

---

## Task 6: 端到端验证 + commit

- [ ] **Step 1: 安装 openclaw-ui 依赖**

```bash
cd web-console/openclaw-ui && pnpm install
```

- [ ] **Step 2: 构建 Web Component**

```bash
cd web-console/openclaw-ui && pnpm build
```

- [ ] **Step 3: TypeScript 编译检查（web-console）**

```bash
cd web-console && pnpm exec tsc --noEmit
```

- [ ] **Step 4: 生产构建（web-console）**

```bash
cd web-console && pnpm build
```

- [ ] **Step 5: dev server 验证**

访问 http://localhost:5174/chat/lit，验证：
- Lit 组件加载成功
- WebSocket 连接
- 流式对话
- 工具卡片

- [ ] **Step 6: commit**

---

## 验收标准

1. ✅ openclaw-ui 子项目构建成功（cloudops-chat.js）
2. ✅ web-console TypeScript 编译通过
3. ✅ web-console 生产构建成功
4. ✅ /chat/lit 页面加载 Lit 组件
5. ✅ WebSocket 连接 + 流式对话
6. ✅ 工具卡片展开
7. ✅ 中止按钮
8. ✅ 断线恢复
