# AI 云助手 Plan 模式修复设计

## 概述

修复 AI 云助手 plan 模式的三个问题：
1. Plan 模式只读命令白名单过窄，误拦常见只读命令
2. Plan → Build 模式切换时丢失对话上下文
3. Plan/Build/Confirm 模式按钮位置不便操作

## 改动详情

### 改动 1：扩充 Plan 模式只读命令白名单

**文件**: `internal/api/chat.go` - `isDestructiveCommand()` 函数（L742-770）

**问题**: 当前白名单只有 26 个基础命令，且未知命令默认阻拦（`return true`）。`grep`、`find`、`git status`、`az account list` 等常见只读命令被误拦，导致 AI 在 Plan 模式下无法执行正常的诊断和信息收集。

**方案**:

1. 扩充 `readOnly` 白名单，增加以下类别：
   - 文本处理：`grep`, `find`, `wc`, `sort`, `uniq`, `diff`, `file`, `stat`, `awk`, `sed`, `cut`, `tr`
   - Git 只读命令：`git status`, `git log`, `git diff`, `git show`, `git branch`, `git tag`, `git remote`, `git config`
   - 网络诊断：`ping`, `curl`, `wget`, `nslookup`, `dig`, `host`, `ip`
   - 云 CLI 只读命令：`az account`, `az group list`, `az vm list`, `az network`, `oci compute instance list`, `tccli cvm Describe`
   - 系统信息：`lscpu`, `lsblk`, `lsusb`, `lspci`, `lsmod`, `cat /proc`

2. 修改默认行为：未知命令从 `return true`（阻拦）改为 `return false`（放行）。理由：Plan 模式的目的不是完全禁止 shell 执行，而是防止破坏性操作。误拦只读命令比放行未知命令的后果更严重。

**验证**: 修改后，`grep`、`git status`、`az account list` 等命令在 Plan 模式下应正常执行；`rm`、`install`、`az vm delete` 等破坏性命令仍被阻拦。

### 改动 2：模式切换时加载历史消息

**文件**: `internal/api/chat.go` - `Stream()` 函数（L38-65）

**问题**: 每次请求只构建 `[system_prompt, user_message]`，不从数据库加载历史消息。用户在 Plan 模式下与 AI 对话后，切换到 Build 模式时，AI 完全丢失之前的对话上下文，无法继续之前的任务。

**方案**:

1. 新增 `loadSessionHistory(sessionID string) []map[string]interface{}` 方法：
   - 根据 `session_id` 查询 `sessions` 表获取 `internalID`
   - 从 `messages` 表按 `created_at` 升序加载所有消息
   - 返回 `[{role, content}, ...]` 数组

2. 修改 `Stream()` 函数的消息构建逻辑：
   ```
   messages = [system_prompt]
   if session_id != nil:
       messages += loadSessionHistory(session_id)
   messages += [user_message]
   ```

3. 同时在 `saveSessionMessages()` 中更新 session 的 mode 字段，记录模式切换历史。

**验证**: 在 Plan 模式下发送消息 → 切换到 Build 模式 → 发送新消息，AI 应能引用之前的对话内容。

### 改动 3：模式按钮移到输入框下方

**文件**: `web/index.html`

**问题**: Plan/Build/Confirm 模式按钮在聊天区域顶部（`.chat-header`），距离输入框较远，操作不便。

**方案**:

1. 将 `.mode-toggle` div 从 `.chat-header` 移到 `.chat-input-area` 内
2. 新布局：
   ```
   [chat-header]
     [sessions-btn]                    [settings-btn]
   [chat-input-area]
     [textarea] [send-btn]
     [Plan] [Build] [Confirm]   [hint-text]
   ```
3. 调整 CSS：模式按钮行放在输入框和 hint 之间，使用 flex 布局，按钮紧凑排列

**验证**: 模式按钮显示在输入框下方，点击切换模式正常工作，hint 文字正确更新。

## 影响范围

| 文件 | 改动类型 |
|------|----------|
| `internal/api/chat.go` | 修改 `isDestructiveCommand()` 白名单 + 新增 `loadSessionHistory()` + 修改 `Stream()` |
| `web/index.html` | 移动 `.mode-toggle` 位置 + 调整 CSS |

## 风险评估

- **改动 1**: 低风险。白名单只影响 Plan 模式的命令过滤，不影响 Build/Confirm 模式。
- **改动 2**: 中风险。加载历史消息会增加 LLM 上下文长度，可能增加 token 消耗和响应延迟。但这是必要的功能修复。
- **改动 3**: 低风险。纯 UI 调整，不影响后端逻辑。
