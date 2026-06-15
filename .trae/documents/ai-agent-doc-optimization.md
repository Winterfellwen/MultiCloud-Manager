# AI Agent 文档使用优化方案

## 摘要

当前 AI agent 通过 `cat docs/cloud-api/{provider}.md` 获取云 API 参考文档，存在 3 个问题：
1. **每次消耗 1 轮 tool call**（额外延迟 ~2-5 秒）
2. **tool result 被截断到 2000 字符**（`chat_async.go:315`），alicloud.md 有 37.8KB，只返回 5%
3. **每次新对话重复 `cat`**，无法跨会话复用

推荐**方案 C（混合方案）**：常用信息注入 system prompt（零延迟），完整文档通过专用工具按需获取。

## 当前状态分析

| 维度 | 现状 |
|------|------|
| 文档获取方式 | prompt 指令要求 LLM 主动 `cat docs/cloud-api/{provider}.md` |
| tool result 截断 | `chat_async.go:315` 统一截断 2000 字符 |
| 文档大小 | aws.md ~8KB, alicloud.md ~37.8KB, azure.md ~5KB, oracle.md ~2.9KB, tencent.md ~4KB, render.md ~3KB |
| RAG/向量检索 | 不存在 |
| Context Injection | 仅通过 PromptBuilder 的 mode/skill/extras |

## 方案对比

| 维度 | A: 全量注入 | B: 专用工具 | **C: 混合（推荐）** |
|------|------------|------------|-------------------|
| Token 效率 | 低（全量 ~60KB） | 中（仍需 1 轮） | **高（摘要 ~5KB + 按需获取）** |
| 响应速度 | 最快 | 慢（+1 轮） | **快（常用零延迟）** |
| 可靠性 | 中（关键词误匹配） | 高 | **高（摘要兜底 + 精确获取）** |
| 实现复杂度 | 低 | 中 | 中 |

## 实现计划

### 步骤 1: 新建 `internal/agent/doc_index.go`

DocIndex 模块，负责文档扫描、摘要提取、缓存和关键词检测。

- 启动时扫描 `docs/cloud-api/*.md`，为每个文档提取精简摘要
- 摘要内容：Authentication section + Common Endpoints section + 文件首段描述
- 目标：每个文档摘要 500-800 字符（~150-250 token），6 个平台合计 ~3000-4800 字符
- `DetectProviders(text)` 方法：通过关键词匹配检测用户消息中提到的云平台
- `GetSummary(provider)` / `GetFullDoc(provider)` / `GetSection(provider, section)` 方法
- 使用 `sync.RWMutex` 保证并发安全

### 步骤 2: 修改 `internal/agent/prompt.go`

- 添加 `Clone()` 方法（避免 `GetSystemPrompt` 多次调用时互相污染）
- 更新 `DefaultSystemPrompt` 中的文档指引：
  - 规则 0 从 "READ DOCS FIRST → cat docs/..." 改为 "USE CLOUD API DOCS → quick reference 已注入，详细信息用 lookup_cloud_api_doc 工具"
  - "Cloud REST API Knowledge Base" section 改为工具使用说明

### 步骤 3: 修改 `internal/agent/runtime.go`

- `Runtime` 结构体添加 `docIndex *DocIndex` 字段
- `RuntimeConfig` 添加 `DocsDir string` 字段（默认 `docs/cloud-api`）
- `NewRuntime` 中初始化 DocIndex 并传递给 Executor
- `GetSystemPrompt` 签名变更：`GetSystemPrompt(mode string)` → `GetSystemPrompt(mode string, userMessage string)`
- 在 `GetSystemPrompt` 中：clone prompt builder → 检测 provider → 注入摘要到 extras

### 步骤 4: 修改 `internal/agent/executor.go`

- `Executor` 添加 `docIndex *DocIndex` 字段和 `SetDocIndex()` 方法
- 添加 `lookupCloudAPIDoc(ctx, args)` handler：
  - 参数：`provider`（必需，enum: azure/aws/alicloud/tencent/oracle/render）、`section`（可选）
  - 返回完整文档内容或指定 section

### 步骤 5: 修改 `internal/agent/tools.go`

- 注册 `lookup_cloud_api_doc` 工具（带 JSON Schema 定义）
- `ReadOnlyTools` 添加 `"lookup_cloud_api_doc": true`

### 步骤 6: 修改 `internal/api/chat_async.go`

- 第 91 行：`GetSystemPrompt(r.Mode)` → `GetSystemPrompt(r.Mode, r.UserMessage)`
- 第 315-317 行：截断逻辑区分工具类型，`lookup_cloud_api_doc` 使用 16000 字符限制（其他保持 2000）
- `compactMessages` 中（约第 1182 行）：文档工具结果不被截断到 200 字符

## 修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `internal/agent/doc_index.go` | 新建 | DocIndex 文档索引模块 |
| `internal/agent/prompt.go` | 修改 | Clone() 方法 + 文档指引文案更新 |
| `internal/agent/runtime.go` | 修改 | 集成 DocIndex，GetSystemPrompt 签名变更 |
| `internal/agent/executor.go` | 修改 | lookupCloudAPIDoc handler |
| `internal/agent/tools.go` | 修改 | 注册新工具 + ReadOnlyTools |
| `internal/api/chat_async.go` | 修改 | 适配新签名 + 截断逻辑区分 |

## 验证步骤

1. `go build ./...` 编译通过
2. Docker 构建部署成功
3. 浏览器测试：发送包含 "aws" 的消息 → 检查 system prompt 中是否包含 AWS 摘要
4. 浏览器测试：发送 "查看 EC2 实例列表" → agent 应直接操作，不需要先 `cat`
5. 浏览器测试：发送 "帮我查看阿里云 OSS 的详细 API" → agent 应调用 `lookup_cloud_api_doc(provider="alicloud", section="OSS")`
6. 确认 `lookup_cloud_api_doc` 返回完整内容（不被截断到 2000 字符）
