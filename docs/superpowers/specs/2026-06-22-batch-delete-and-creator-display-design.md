# 对话批量删除与用户归属显示设计文档

## 1. 背景与目标

当前对话列表完全存储在客户端（localStorage），服务端没有"列出用户会话"的能力。需要实现：
- 批量删除对话功能
- 对话列表显示创建者信息
- 管理员可查看所有对话，可删除但不能继续对话
- 普通用户可查看自己和同团队的对话，可删除自己的，不能继续他人/团队的对话

## 2. 数据库变更

### `acp_replay_sessions` 表新增字段

```sql
ALTER TABLE acp_replay_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN username TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN title TEXT DEFAULT '';
CREATE INDEX idx_acp_sessions_user ON acp_replay_sessions(user_id);
```

### 现有数据处理

从 sessionKey（格式 `chat:{userId}:{ts}:{rand}`）解析 userId 填充 `user_id`；`username` 填充 `'unknown'`（历史数据无法恢复用户名）；`title` 从第一条 user_message 的 content 截取前 50 字符。

### 新会话创建

`chat.send` RPC 处理中，当创建新 `acp_replay_sessions` 时，从 JWT 提取 `userId` 和 `username` 写入新字段。客户端发送 `chat.send` 时可携带 `title` 参数。

## 3. 后端 RPC 方法

### `sessions.list`

**请求：** `{ filter?: 'mine' | 'team' | 'all' }`

**响应：** `{ sessions: [{ sessionKey, title, username, userId, messageCount, lastMessageAt, createdAt }] }`

**权限逻辑：**
- admin：`filter=all` 返回所有；`filter=mine` 只看自己的
- 普通用户：`filter=mine` 返回自己的；`filter=team` 返回同 team 的；忽略 `filter=all`
- 默认 `filter=mine`

**查询：** 从 `acp_replay_sessions` 查询，通过 `acp_replay_events` COUNT 聚合获取 messageCount，通过 MAX(timestamp) 获取 lastMessageAt。

### `sessions.deleteBatch`

**请求：** `{ sessionKeys: string[] }`

**响应：** `{ deleted: number, errors?: [{ key, error }] }`

**处理逻辑：**
1. 对每个 sessionKey 验证权限（admin 可删所有，普通用户只能删 own + team）
2. 如有运行中的 generation，调用 abort 逻辑
3. `DELETE FROM acp_replay_events WHERE session_key = ?`
4. `DELETE FROM acp_replay_sessions WHERE session_key = ?`
5. 逐个处理，收集错误

## 4. 前端组件变更

### SessionList 组件

**新增状态：**
- `isEditing: boolean` — 编辑模式开关
- `selectedKeys: Set<string>` — 已选中的会话 key
- `sessionsFromServer: ChatSession[]` — 从服务端获取的列表

**新增 UI：**
- 顶部工具栏：编辑/完成 按钮 + 全选复选框 + 删除选中按钮 + 选中计数
- 每行左侧：复选框（编辑模式下显示）
- 每行标题下方：`username · N条消息 · 时间`

**交互：**
- 点击"编辑"进入编辑模式，显示复选框
- 点击"完成"退出编辑模式，清空选中
- 全选复选框：选中当前可见的所有会话
- "删除选中"按钮：调用 `deleteSessions(selectedKeys)`，删除后刷新列表

### ChatReact 页面

- 新增判断 `isViewingOthersSession`：当前会话的 userId ≠ 当前用户 ID
- 若为 true：隐藏 ChatInput 组件，MessageList 只读

### Chat Store

- 移除 localStorage 持久化会话列表
- `fetchSessions(filter)` — 调用 `sessions.list` RPC
- `deleteSessions(keys)` — 调用 `sessions.deleteBatch` RPC
- 新会话创建后调用 `fetchSessions` 刷新列表
- 保留 `messagesBySession` 的 localStorage 持久化（消息内容不需要服务端列表）

## 5. 权限矩阵

| 角色 | 查看范围 | 删除范围 | 自己的对话 | 他人/团队的对话 |
|------|---------|---------|-----------|---------------|
| admin | 所有 | 所有 | 正常聊天 | 只读（输入框+发送+中止按钮隐藏） |
| 普通用户 | own + team | own | 正常聊天 | 只读（输入框+发送+中止按钮隐藏） |

**关键规则：能否聊天取决于是否是对话创建者，与角色无关。**

## 6. 用户表变更

`users` 表新增 `team` 字段：

```sql
ALTER TABLE users ADD COLUMN team VARCHAR(64) DEFAULT '';
CREATE INDEX idx_users_team ON users(team);
```

`team` 为空字符串表示未分组。`sessions.list` 的 `filter=team` 查询同 team 且 team 非空的用户会话。

## 7. 测试要点

- 管理员能看到所有会话，删除非自己的会话成功，无法在他人会话中发送消息
- 普通用户只能看到 own + team 的会话，删除他人会话被拒绝，无法在他人/团队会话中发送消息
- 批量删除：选中多个会话后删除，列表刷新，已删除会话的消息被清理
- 未分组用户（team=''）的 `filter=team` 只返回自己的会话
- 新会话创建后自动刷新列表，显示正确的创建者信息
