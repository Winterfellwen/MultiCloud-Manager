# AI 聊天会话管理架构重构

**日期:** 2026-06-16
**状态:** 设计稿
**范围:** `web/index.html` 前端聊天消息管理重构（不改后端）

---

## 1. 背景

### 1.1 重复消息场景

当前 AI 聊天前端有以下明确的重复消息场景：

1. AI 流式输出中切换到另一个 session，再切回原 session → 消息重复
2. 查看历史消息时，页面自动滚动到底部
3. 跨 session 的工具调用状态互相污染

### 1.2 根本原因

前端有三条数据写入路径互相覆盖，且存在跨 session 的全局状态变量：

```
路径 A: SSE 事件 → handleStateChangeEvent → 写入 SESSION_MESSAGES
路径 B: switchSession → 从 API 读取 → 覆盖 SESSION_MESSAGES
路径 C: poll → 从 API 读取 → 再次覆盖 SESSION_MESSAGES + DOM
```

同时，`PENDING_TOOL_CALLS` 和全局 EventSource 让跨 session 的数据可以互相污染。

### 1.3 后端已有正确支撑

本方案不改后端一行代码。后端已经正确处理了数据持久化：

- 所有事件写入 `run_events` 表（tokens、tool_start、tool_result、state_change）
- `replayEvents()` 支持按 `last_event_id` + `session_id` 重放非 token 事件
- `AggregateOnDone()` 在 run 完成时从 `run_events` 重构完整对话并写入 DB
- 切换回已完成的 session 时，API 返回完整正确的数据

问题完全在前端的状态管理。

---

## 2. 设计原则

1. **单一数据源**：所有已完成的聊天消息，从 API（后端/DB）读取。前端不做消息拼装。
2. **SSE 与 session 绑定**：EventSource 只连接当前 session。切 session 时关闭旧连接，创建新连接。
3. **流式状态与 session 生命周期绑定**：`STREAMING_CONTENT`、`PENDING_TOOL_CALLS` 是当前 session 的临时状态，切 session 时清空重置。
4. **前端 cache 只读**：`SESSION_MESSAGES` 只作为 API 数据的只读缓存，不被 SSE handler 或 poll 写入。

---

## 3. 改动明细

### 3.1 移除项

| 移除项 | 位置 | 说明 |
|--------|------|------|
| `GLOBAL_EVENT_SOURCE` | ~1890-1934 | 全局 EventSource，不再需要 |
| `SUBSCRIBED_SESSIONS` | ~1892 | 不再维护订阅列表 |
| `subscribeToSession()` | ~1950-1964 | 不再需要 |
| `startGlobalEventSource()` | ~1907-1934 | 不再需要 |
| `_esProcessingEvents` | ~1937 | 不再需要全局处理锁 |
| `_processedEventIds` | ~1938-1948 | 不再需要全局去重 |
| `SESSION_STREAMING_CONTENT` | ~2063 | 不再需要跨 session 的 token 兜底 |
| `savePartialContent()` | ~2314-2331 | 不再需要部分保存 |
| `lastSyncedMsgCount` | ~6630 | poll 不再同步消息 |
| poll 中的消息同步逻辑 | ~6622-6656 | 仅检查 session 状态 |
| `else if (!isRunning)` 中的 cache 替换+DOM 重渲染 | ~3725-3747 | 不再需要 |

### 3.2 函数改动

#### `switchSession(sid)`

当前问题：
- 调用 `savePartialContent()` 保存部分状态到 `SESSION_MESSAGES`（引入脏数据）
- `else if (!isRunning)` 块重新从 API 取数据并覆盖 cache 和 DOM（与 liveMsgs 渲染冲突）
- 没有重置 `PENDING_TOOL_CALLS`

改动后：
- **移除** `savePartialContent()` 调用（~3580-3601）
- **移除** `else if (!isRunning)` 中的 `SESSION_MESSAGES[sid] = ...` 替换和 DOM 重渲染（~3725-3747）
- **新增** `PENDING_TOOL_CALLS = []`（在 `STREAMING_CONTENT = ''` 旁）
- 保持 `_directSSEController.abort()`（已有）
- 保持 `STREAMING_DIV = null`、`STREAMING_CONTENT = ''`（已有）
- 保持 `liveMsgs` 渲染（如果有缓存，直接用）
- 保持 `if (!liveMsgs)` 从 API 读取并写入缓存
- 保持 `if (CURRENT_RUN_ID && isRunning)` 打开新 SSE

#### `handleStateChangeEvent(ev)` done 分支

当前问题：
- 非当前 session 的 done 事件也写入 `SESSION_MESSAGES`（跨 session 污染）
- 从 DOM 收集 blocks 并写入 cache（与 API 数据冲突）
- 清空 `STREAMING_CONTENT`、`PENDING_TOOL_CALLS`（影响当前 session 的流式输出）

改动后：
- `isCurrentSession` 守卫：非当前 session 的 done 事件**不再写入任何 cache**，直接 return
- **移除** DOM → blocks → `SESSION_MESSAGES` 的写入逻辑
- **移除** `PENDING_TOOL_CALLS` 的跨 session 处理
- 只做 DOM 清理（移除 streaming class、finalize tool cards）
- 重置 `STREAMING_CONTENT`、`PENDING_TOOL_CALLS`（仅限当前 session）

#### `handleStateChangeEvent(ev)` error / stopped 分支

- 不做改动。已有 `isCurrentSession` 守卫，DOM 操作用 `STREAMING_DIV` 本地引用。

#### `handleTokenEvent(ev)`

- 不做改动。`STREAMING_CONTENT` 累加 + DOM 渲染保持。

#### `handleToolStartEvent(ev)` / `handleToolResultEvent(ev)`

- 不做改动。`PENDING_TOOL_CALLS` 累加 + DOM tool card 渲染保持。
- 切 session 时 `PENDING_TOOL_CALLS` 被 `switchSession` 清空，无跨 session 污染。

#### `startSessionPoll()`

当前问题：
- 每 5 秒 fetch API 并比较 `data.messages.length !== lastSyncedMsgCount`
- 发现差异时替换 cache 和 DOM（与 SSE handler 写入互相覆盖，触发多余 DOM 更新和滚动）

改动后：
- **移除** 消息 fetch 和同步逻辑
- **移除** `lastSyncedMsgCount` 变量
- 只检查 session state（running / done / waiting_confirm）并更新 UI（stop button 状态）

#### `scrollToBottom(el)`

- 已改为 smart scroll（检查 `wasNearBottom`，已在之前修复）
- 不做新改动

---

## 4. 数据流终版

```
发送消息 → POST /agent/chat/stream → 返回 run_id
    ↓
打开 SSE 连接（仅当前 session ID）
    ↓
SSE 事件:
  token       → STREAMING_CONTENT 累加 + 渲染 DOM
  tool_start  → PENDING_TOOL_CALLS 累加 + 渲染 tool card
  tool_result → 更新 tool card 状态
  state_change:done → DOM 清理 + 重置状态，SSE 关闭
    ↓
切换 session →
  1. _directSSEController.abort() → 关闭旧 SSE
  2. STREAMING_DIV = null, STREAMING_CONTENT = '', PENDING_TOOL_CALLS = []
  3. 从 API fetch 目标 session 完整数据
  4. 渲染 DOM
  5. 如果目标 session 还在运行，打开新 SSE
    ↓
AI 完成输出 →
  后端 AggregateOnDone 从 run_events 重构对话 → 写入 DB
  下次 switch 时前端从 API 读出完整数据
```

---

## 5. 边界情况处理

### 5.1 Session 完成时用户在另一个 session

- SSE 已关闭（切走时关了），不会收到 done 事件
- 后端完成时写入 DB（`AggregateOnDone`）
- 用户切回时通过 API 获取完整数据

### 5.2 Session 还在运行时用户切回

- API 返回 `active_run_id`（不为空）
- 前端打开新 SSE 连接
- 从当前时间点续流
- 非 token 事件（tool_start、state_change）通过 `replayEvents` 重放
- Token 事件不重放（后端设计如此），但完成后 `AggregateOnDone` 确保 DB 数据完整

### 5.3 多轮对话

- 每轮完成后后端写入 DB
- 前端每次 switch 从 API 读取，无特殊处理

### 5.4 错误 / 停止状态

- `state_change:error` 和 `state_change:stopped` 在 DOM 层处理
- 非当前 session 的事件被 `isCurrentSession` 守卫忽略
- 错误信息通过 API 在下次 switch 时读取

---

## 6. 测试验证

现有测试套件：

- `test_all_bugs.py` — 基础功能：滚动、thinking 指示器、错误显示、工具调用去重
- `test_delayed_dup.py` — 延迟重复：切回已完成/进行中的 session
- `test_multi_turn.py` — 多轮对话
- `test_chat_history.py` — 会话切换场景

所有测试在重构前后均应通过。

---

## 7. 回滚方案

```bash
git checkout web/index.html
docker cp web/index.html multicloud-manager-backend-1:/app/web/index.html
```
