# AIOps 智能运维闭环增强设计

> **Status**: Approved (2026-07-01)
> **Author**: AI-Wen
> **Phase**: 4-6（延续 Phase 1-3）

## 目标

在已完成的 Phase 1-3（审计日志、AI 告警分析、Dashboard 洞察、Prometheus、K8s 加固）基础上，构建"**预测 → 自愈 → 学习**"的完整 AIOps 闭环，让系统具备事前预警、自动修复、经验积累的能力。

## 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AIOps 智能运维闭环                         │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ 1. 预测引擎   │───▶│ 2. 自愈引擎   │───▶│ 3. 知识库    │   │
│  │              │    │              │    │              │   │
│  │ 定时分析指标  │    │ 告警触发      │    │ 记录处置经验  │   │
│  │ 线性回归预测  │    │ AI 生成修复计划│    │ RAG 检索相似  │   │
│  │ 生成预测告警  │    │ 按策略执行    │    │ 加速下次决策  │   │
│  │              │    │ 验证+审计     │    │              │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         ▲                                        │          │
│         └──────────────────────────────────────────┘          │
│                    (经验反哺预测)                              │
└─────────────────────────────────────────────────────────────┘
```

**核心数据流：**

1. **预测引擎**（定时任务，每 10 分钟）分析实例 metrics 历史趋势，用线性回归预测"磁盘何时满、内存何时 OOM"，生成预测告警
2. **自愈引擎**监听告警（实时 + 预测），调用 ai-gateway 分析根因 → 生成修复计划 → 按环境策略执行 → 验证 → 写审计 + 知识库
3. **知识库**记录每次自愈的结构化经验。新告警来时 RAG 检索相似历史案例，AI 分析时能引用历史经验

---

## Phase 4: 预测引擎

### 职责

基于历史指标趋势，预测未来可能触发的告警，实现"事前预警"。

### 触发方式

monitor-service 定时任务，每 10 分钟执行一次。也支持手动触发（demo 用）。

### 算法

简单线性回归（不引入 ML 库）。对每个实例的最近 24 小时指标数据点做最小二乘法拟合，预测指标达到阈值的预计时间。

### 预测范围

| 指标 | 预测条件 | 预测维度 |
|------|---------|---------|
| `disk_utilization` | 按当前增长趋势，X 小时后达到 90% | 最有价值，磁盘满是最常见故障 |
| `memory_utilization` | 按当前趋势，X 小时后达到 90% | 预测 OOM |
| `cpu_utilization` | 持续 >80% 超过 30 分钟 | 趋势异常检测（已有，不做预测） |

CPU 波动大不做预测。磁盘和内存做预测。

### 数据源

metrics 表，取最近 24 小时、每 5 分钟一个数据点（约 288 个点）

### 输出

生成 `alerts` 记录，`severity='info'`，`message` 格式："预测：web-prod-01 磁盘使用率将在约 18 小时后达到 90%（当前 75%，趋势 +0.8%/h）"

### 数据库表

```sql
CREATE TABLE metric_predictions (
  id SERIAL PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  metric_name VARCHAR(64) NOT NULL,        -- disk_utilization / memory_utilization
  current_value DECIMAL(12,4) NOT NULL,    -- 当前值
  predicted_value DECIMAL(12,4) NOT NULL,  -- 预测达到的阈值（90）
  threshold DECIMAL(12,4) NOT NULL,         -- 触发阈值
  hours_to_threshold DECIMAL(8,2) NOT NULL, -- 预计几小时后达到
  slope DECIMAL(12,6) NOT NULL,            -- 斜率（每小时变化量）
  confidence DECIMAL(5,2) NOT NULL,        -- 置信度 0-100（R² 值）
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_predictions_instance ON metric_predictions(instance_id);
CREATE INDEX idx_predictions_created ON metric_predictions(created_at DESC);
```

### 置信度机制

用 R²（决定系数）衡量拟合质量。R² < 0.7 时不生成预测告警（数据太乱，线性模型不适用）。

### API 端点

```
GET /api/monitor/predictions          -- 列出当前活跃的预测（前端展示）
POST /api/monitor/predictions/run     -- 手动触发一次预测（demo 用）
```

### 前端展示

- Dashboard 新增"预测预警"卡片，显示未来可能触发的告警列表，每条带倒计时（"18 小时后"）和置信度徽章
- Monitor 页面新增"预测"Tab，展示完整预测列表 + 趋势图

---

## Phase 5: AI 故障自愈引擎

### 职责

告警触发时，AI 分析根因 → 生成修复计划 → 按环境策略执行 → 验证 → 审计

### 触发入口

监听 `alerts` 表的新增记录（firing 状态）。两种触发源：
- 实时告警（alert-engine 已有逻辑触发）
- 预测告警（Phase 4 的预测引擎生成）

### 自愈流程（5 个阶段）

```
告警触发
   ↓
1. 根因分析 ── ai-gateway 分析告警+实例上下文 → 生成根因报告
   ↓
2. 生成修复计划 ── LLM 输出结构化 JSON: 修复动作 + 预期效果 + 风险评估
   ↓
3. 策略决策 ── 按环境策略(dev/uat/prod) + 动作危险级别 决定自动执行 or 需确认
   ↓
4. 执行修复 ── 调用 ai-gateway 的 Agent 工具(复用现有 cloud_stop/start/reboot 等)
   ↓
5. 验证+审计 ── 等待 60s 检查指标是否恢复 → 记录自愈结果到审计 + 知识库
```

### 数据库表

```sql
-- 自愈策略（用户可配置每个动作的策略）
CREATE TABLE remediation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  action_type VARCHAR(64) NOT NULL,        -- reboot_instance / stop_instance / scale_up
  env_tags JSONB NOT NULL,                 -- ["dev","uat","prod"] 适用环境
  auto_execute JSONB NOT NULL,             -- {"dev":true,"uat":true,"prod":false}
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 自愈执行记录
CREATE TABLE remediation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  root_cause TEXT,                         -- AI 分析的根因
  action_plan JSONB,                       -- LLM 生成的修复计划
  action_executed VARCHAR(64),             -- 实际执行的动作
  status VARCHAR(32) DEFAULT 'pending',    -- pending/approved/executing/success/failed/skipped
  env VARCHAR(32),                         -- dev/uat/prod（从实例 tags 读）
  triggered_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by UUID,
  executed_at TIMESTAMP,
  verified_at TIMESTAMP,
  verification_result TEXT,                -- 验证结果描述
  error_message TEXT
);

CREATE INDEX idx_remediation_runs_status ON remediation_runs(status);
CREATE INDEX idx_remediation_runs_alert ON remediation_runs(alert_id);
```

### 修复动作类型

| 动作 | 危险级别 | 适用场景 |
|------|---------|---------|
| `reboot_instance` | moderate | CPU/内存持续异常，重启恢复 |
| `stop_instance` | moderate | 异常实例紧急停止 |
| `scale_up` | dangerous | 资源不足，扩容实例规格 |

先做这 3 个最实用的（YAGNI）。clean_disk 等后续再加。

### 环境策略决策逻辑

```typescript
function decideExecution(action: string, env: string): 'auto' | 'confirm' | 'skip' {
  const policy = policies.find(p => p.action_type === action && p.env_tags.includes(env));
  if (!policy || !policy.enabled) return 'skip';
  return policy.auto_execute[env] ? 'auto' : 'confirm';
}

// 决策矩阵（默认）：
// action=reboot, env=dev    → auto
// action=reboot, env=uat    → auto
// action=reboot, env=prod   → confirm
// action=stop,   env=dev    → auto
// action=stop,   env=uat    → confirm
// action=stop,   env=prod   → confirm
// action=scale_up, any env  → confirm（成本敏感，都要确认）
```

### AI 根因分析 → 修复计划输出格式

ai-gateway 的 `/internal/analyze-remediation` 端点接收告警上下文，LLM 返回结构化 JSON：

```json
{
  "rootCause": "web-prod-01 内存使用率持续上升，疑似内存泄漏",
  "recommendedAction": "reboot_instance",
  "reasoning": "重启可释放累积的内存，如果是应用泄漏需要后续排查代码",
  "riskLevel": "moderate",
  "expectedEffect": "内存使用率降至 40-50%",
  "verificationMetric": "memory_utilization",
  "verificationTimeout": 60
}
```

### 执行链路（复用现有 AI Agent）

monitor-service 的自愈执行器调用 ai-gateway 的 `/internal/execute-remediation` 端点，该端点内部调用现有 Agent runner（action 模式），触发 `cloud_reboot_instance` 等工具真实执行。

```
monitor-service (自愈引擎)
  → POST ai-gateway/internal/execute-remediation
    → ai-gateway runner (action mode)
      → cloud_reboot_instance 工具
        → cloud-service POST /cloud/instances/{id}/reboot
```

### 验证机制

执行修复后等待 60 秒，重新查询该实例的指标，对比告警阈值判断是否恢复。验证结果写入 `remediation_runs.verification_result`。

### 前端展示

| 位置 | 内容 |
|------|------|
| Monitor 页面新增"自愈"Tab | 自愈执行记录列表，状态徽章（pending/executing/success/failed） |
| 待审批的任务 | 红色高亮 + "批准"按钮 |
| 详情展开 | 显示 AI 根因分析 + 修复计划 + 执行结果 + 验证结果 |
| AiSettings 新增"自愈策略"区 | 配置每种动作在每个环境的自动/确认策略 |

---

## Phase 6: 运维知识库 + RAG

### 职责

积累每次告警处置经验，新告警来时检索相似历史案例，加速 AI 决策。让系统"越用越聪明"。

### 核心理念

每次自愈执行（成功或失败）都生成一条结构化经验记录。下次类似告警来时，AI 分析阶段会先检索知识库找相似案例，作为上下文喂给 LLM。

### 数据库表

```sql
-- 知识库条目（每次自愈自动生成）
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  remediation_run_id UUID REFERENCES remediation_runs(id) ON DELETE SET NULL,

  -- 结构化经验（用于检索匹配）
  symptom TEXT NOT NULL,              -- 症状描述（如"CPU 持续 >85%"）
  metric_name VARCHAR(64) NOT NULL,  -- 涉及的指标
  instance_provider VARCHAR(32),    -- 云厂商
  instance_env VARCHAR(32),          -- 环境

  -- 处置经验
  root_cause TEXT,                   -- 根因（如"内存泄漏"）
  action_taken VARCHAR(64),          -- 执行的动作（如 reboot_instance）
  outcome VARCHAR(32) NOT NULL,      -- success / failed
  resolution_time_minutes INT,        -- 从告警到恢复的耗时

  -- 向量嵌入（用于语义检索）
  embedding VECTOR(1536),            -- pgvector，文本 embedding

  -- 人工标注
  helpful_count INT DEFAULT 0,        -- 被引用并采纳的次数
  created_at TIMESTAMP DEFAULT NOW()
);

-- 为向量列创建索引
CREATE INDEX idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_kb_symptom ON knowledge_base USING gin (to_tsvector('chinese', symptom));
```

### 向量存储方案

使用 PostgreSQL 的 `pgvector` 扩展（不在应用层维护向量数据库）。

### RAG 检索流程

```
新告警触发
   ↓
1. 生成查询向量 ── 将告警症状描述 embedding
   ↓
2. 向量检索 ── pgvector 余弦相似度查询 top-5 相似经验
   ↓
3. 关键词补充 ── PostgreSQL 全文检索（中文分词）补充匹配
   ↓
4. 合并去重 ── 向量结果 + 关键词结果，按相似度排序
   ↓
5. 注入 AI 上下文 ── "历史相似案例：..." 喂给根因分析 LLM
```

### Embedding 生成

复用用户配置的默认 LLM provider（与 llm-resolver 一致），调用 provider 的 `/embeddings` 端点。如果 provider 不支持 embedding，降级为纯关键词检索（不报错，优雅降级）。

### 知识库条目自动生成时机

自愈执行完成 + 验证结果后，monitor-service 自动将这次处置经验写入 knowledge_base。

### AI 分析增强（注入 RAG 上下文）

修改 Phase 5 的 `/internal/analyze-remediation` 端点，在 prompt 中注入历史经验：

```
你是云运维专家。请分析以下告警的根因并推荐修复方案。

【当前告警】
- 实例: web-prod-01 (aws, prod)
- 指标: memory_utilization = 92.1%（阈值 90%）
- 持续时间: 8 分钟

【历史相似案例】（来自知识库）
1. [success] 2026-06-15 类似症状：api-worker-02 内存 94% → 根因：内存泄漏 → 动作：reboot_instance → 15 分钟后恢复
2. [failed] 2026-06-10 类似症状：db-staging-01 内存 91% → 根因：查询过多 → 动作：reboot_instance → 未恢复（需扩容）

请基于历史经验分析，输出 JSON 格式的修复计划...
```

### API 端点

```
GET /api/monitor/knowledge-base           -- 列出知识库条目（分页）
GET /api/monitor/knowledge-base/search     -- 语义检索相似案例（demo 用）
```

### 前端展示

| 位置 | 内容 |
|------|------|
| Monitor 页面新增"知识库"Tab | 知识库条目列表，按时间/有用程度排序 |
| 详情展开 | 症状、根因、动作、结果、被引用次数 |
| 搜索框 | 输入症状关键词，语义检索相似案例 |

### 优雅降级策略

| 场景 | 行为 |
|------|------|
| pgvector 未安装 | 跳过向量检索，只用全文检索 |
| provider 不支持 embedding | 跳过向量检索，只用全文检索 |
| 知识库为空（首次使用） | AI 分析不注入历史案例，正常分析 |

---

## 前端整合与演示动线

### Monitor 页面 Tab 扩展

从 3 个 Tab 扩展为 6 个：

```
Monitor 页面
├── 规则（已有）
├── 事件（已有，新增 AI 分析展示）
├── 渠道（已有）
├── 预测（新增）     ← Phase 4
├── 自愈（新增）     ← Phase 5
└── 知识库（新增）   ← Phase 6
```

### Dashboard 页面增强

```
Dashboard 页面
├── 概览统计卡片（已有）
├── 云厂商分布（已有）
├── AI 健康洞察（已有，Phase 2）
├── Token 使用量（已有，Phase 2）
├── 【新增】预测预警卡片      ← 显示未来 X 小时可能触发的告警
└── 【新增】最近自愈记录卡片   ← 显示最近 5 条自愈执行状态
```

### AiSettings 页面新增

```
AiSettings 页面
├── Provider 管理（已有）
├── 模型选择（已有）
├── 深度思考设置（已有）
├── 生成参数（已有）
└── 【新增】自愈策略配置区    ← 配置每种动作在各环境的策略
```

### 自愈策略配置 UI

```
自愈策略配置
┌─────────────────────────────────────────────────────┐
│ 动作          │ dev        │ uat        │ prod       │
├─────────────────────────────────────────────────────┤
│ 重启实例       │ ☑ 自动     │ ☑ 自动     │ ☐ 需确认   │
│ 停止实例       │ ☑ 自动     │ ☐ 需确认   │ ☐ 需确认   │
│ 扩容实例       │ ☐ 需确认   │ ☐ 需确认   │ ☐ 需确认   │
└─────────────────────────────────────────────────────┘
```

### 面试演示动线（5 分钟讲完）

```
1. Dashboard（30秒）
   "看，AI 已生成健康洞察：48 分，识别了 4 个风险"
   指向：预测预警卡片 → "web-prod-01 磁盘 18 小时后满"

2. Monitor → 预测 Tab（30秒）
   "这是预测引擎分析的所有实例趋势"
   展示：线性回归图 + 置信度 + 倒计时

3. Monitor → 事件 Tab（1分钟）
   "这个 CPU 告警触发了自愈"
   点击告警展开 → 显示 AI 根因分析 + 修复计划

4. Monitor → 自愈 Tab（1分钟）
   "AI 决定重启实例，因为 prod 环境需确认"
   展示：待审批记录 → 点击"批准" → 状态变 executing → success
   "看，验证结果显示内存已恢复"

5. Monitor → 知识库 Tab（1分钟）
   "这次处置自动进入知识库"
   展示：症状/根因/动作/结果/被引用次数
   "下次类似告警，AI 会参考这条经验"

6. 回到 Dashboard（30秒）
   "现在健康评分已恢复，因为自愈解决了问题"
```

### Demo 数据增强

现有 `scripts/demo-data.sql` 补充：

| 补充内容 | 用途 |
|---------|------|
| 10 条历史 metrics（24h 磁盘数据） | 预测引擎有数据可分析 |
| 3 条 remediation_runs 记录 | 自愈 Tab 有展示数据 |
| 5 条 knowledge_base 记录 | 知识库 Tab 有展示数据 |
| 2 条 remediation_policies | 策略配置有初始数据 |

---

## 实施顺序

| Phase | 模块 | 内容 |
|-------|------|------|
| **Phase 4** | 预测引擎 | metric_predictions 表 + 预测定时任务 + 前端预测 Tab + Dashboard 卡片 |
| **Phase 5** | 自愈引擎 | remediation_policies/runs 表 + AI 分析端点 + 执行链路 + 前端自愈 Tab + 策略配置 UI |
| **Phase 6** | 知识库 + RAG | knowledge_base 表 + pgvector + RAG 检索 + 前端知识库 Tab |

延续之前 Phase 1-3 的编号。

## 技术约束

- 复用现有 ai-gateway 的 llm-resolver（从 provider store 获取默认 provider）
- 复用现有 AI Agent 的工具执行能力（action 模式触发 cloud_* 工具）
- 线性回归算法手写实现（不引入 ML 库）
- pgvector 使用 PostgreSQL 扩展（不引入独立向量数据库）
- 优雅降级：pgvector 不可用或 provider 不支持 embedding 时，功能仍可工作（降级为关键词检索）
