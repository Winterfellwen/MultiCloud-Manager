# 智能运维 + 安全合规扫描设计

> 定位：扩展现有 AIOps 平台，新增安全合规扫描与容量规划能力，让 AI 主动发现安全风险和容量瓶颈。
>
> 面试叙事：这不是一个被动监控的工具，而是 AI 主动巡检安全风险、预测容量瓶颈、推荐扩容方案的智能运维平台。

## 总体架构

**核心思路**：在现有 monitor-service 中扩展两类智能分析能力，复用已有的数据隔离、告警、知识库、remediation 闭环。

```
┌─────────────────────────────────────────────────────────────┐
│                   monitor-service                            │
│                                                              │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │  prediction-engine   │    │  security-scanner (新)    │    │
│  │  (扩展: 容量规划)    │    │  周期扫描 cloud_resources │    │
│  │  预测磁盘/内存瓶颈  │    │  检测: 公开暴露/未加密/   │    │
│  │  推荐扩容时机+规格   │    │  弱配置/闲置资源          │    │
│  └──────────┬──────────┘    └───────────┬──────────────┘    │
│             │                            │                    │
│             ▼                            ▼                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  findings 统一写入（复用现有表）                      │    │
│  │  • 高危 → alerts (severity=critical/warning)         │    │
│  │  • 建议 → knowledge_base (symptom/rootCause/action)  │    │
│  │  • 可执行 → remediation_runs (待人工审批)            │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│             ┌───────────┴───────────┐                        │
│             │   scopedDb(scope)     │                        │
│             │   public / demo 双跑  │                        │
│             └───────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Dashboard (前端)                                            │
│  • 安全风险卡片 (新增) - 显示 critical/warning 数量+列表     │
│  • 容量建议卡片 (新增) - 显示预测瓶颈+扩容建议              │
│  • 复用现有 AI 洞察面板 (汇总安全+容量)                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  AI Agent (新增 2 个工具)                                   │
│  • security_scan - "检查生产环境有没有安全风险"             │
│  • capacity_analyze - "哪些实例快扛不住了？"                │
│  → 调用 monitor-service API → 返回结构化结果                 │
└─────────────────────────────────────────────────────────────┘
```

**数据流闭环**：
1. security-scanner 定时（每 6 小时）扫描 `cloud_resources` 表，按规则检测安全问题
2. prediction-engine 扩展：除现有磁盘/内存预测外，新增"容量规划"维度（CPU 趋势 + 扩容建议）
3. 发现结果按严重度分流：critical → alerts（触发现有告警链路）；建议级 → knowledge_base
4. critical 发现可自动生成 remediation_run（status=pending，待人工审批）
5. Dashboard 新增两个卡片展示，Agent 新增 2 个工具支持交互式查询

**关键设计决策**：
- **不新建表**：复用 `alerts`（severity 字段区分安全/性能）、`knowledge_base`（symptom 字段记问题描述）、`remediation_runs`
- **不新建服务**：全部在 monitor-service 内，新增 2 个文件
- **双跑机制天然继承**：scopedDb 已支持 public/demo，两个新模块直接用

---

## Section 1: 安全扫描规则引擎

**核心模块**：`monitor-service/src/services/security-scanner.ts`

### 扫描规则（5 类，覆盖常见云安全风险）

| 规则 ID | 检测内容 | 严重度 | 判定逻辑（基于 `cloud_resources.attributes`） |
|---------|---------|--------|-----------------------------------------------|
| `public_exposure` | 资源公网暴露 | critical | `publicIp != null` 或 `attributes.publicIp` 存在 且 `tags.env != 'sandbox'` |
| `unencrypted_disk` | 磁盘未加密 | critical | `resourceType='disk'` 且 `attributes.encrypted=false` |
| `unencrypted_storage` | 对象存储未加密 | warning | `resourceType='bucket'` 且 `attributes.encryption!='SSE'` |
| `idle_resource` | 闲置资源（7天无访问） | warning | `lastSyncedAt < now()-7d` 或 `status='stopped'` 且 `monthlyCost>0` |
| `weak_security_group` | 安全组规则过宽 | warning | `resourceType='securitygroup'` 且 `attributes.rules` 含 `0.0.0.0/0` + 敏感端口（22/3306/6379） |

### 扫描器结构

```typescript
// monitor-service/src/services/security-scanner.ts
interface SecurityFinding {
  ruleId: string;           // 'public_exposure' | 'unencrypted_disk' | ...
  resourceId: string;       // cloud_resources.id
  resourceName: string;
  provider: string;
  region: string;
  severity: 'critical' | 'warning';
  message: string;          // 人类可读描述，如 "web-prod-01 公网 IP 54.221.10.5 暴露"
  recommendation: string;   // "建议绑定安全组仅放行 443，或配置 WAF"
  evidence: Record<string, any>; // 原始属性快照
}

interface SecurityScannerConfig {
  scanIntervalSec: number;  // 默认 6 小时 = 21600
  enabledRules: string[];   // 可配置开关
}

export class SecurityScanner {
  // 与 prediction-engine 一致的双跑模式
  private async runCycle(): Promise<void> {
    await this.scanAll(PUBLIC_SCOPE);
    await this.scanAll(DEMO_SCOPE);
  }

  private async scanAll(scope: RequestScope): Promise<void> {
    const t = scopedDb(scope);
    const resources = await db.select().from(t.cloudResources);
    const findings: SecurityFinding[] = [];
    
    for (const rule of this.rules) {
      const hits = rule.detect(resources);
      findings.push(...hits);
    }
    
    // 去重：同资源同规则若已存在未解决告警，跳过
    await this.persistFindings(findings, scope);
  }

  private async persistFindings(findings: SecurityFinding[], scope: RequestScope) {
    const t = scopedDb(scope);
    for (const f of findings) {
      // critical → 写 alerts (触发告警链路)
      // ruleId 关联 alert_rules 表（首次扫描时自动创建 metric='security' 的规则，见 ensureSecurityRules）
      const ruleId = await this.ensureSecurityRuleId(f.ruleId, scope);
      if (f.severity === 'critical') {
        await db.insert(t.alerts).values({
          ruleId,
          instanceId: null,  // 安全发现可能不关联实例
          severity: 'critical',
          message: f.message,
          status: 'firing',
          firedAt: new Date(),
        });
      }
      // 全部 → knowledge_base (供 AI 检索 + Dashboard 展示)
      await db.insert(t.knowledgeBase).values({
        symptom: f.message,
        metricName: 'security',
        instanceProvider: f.provider,
        rootCause: f.recommendation,
        actionTaken: 'pending',
        outcome: f.severity,  // 'critical' | 'warning'
      });
    }
  }

  /** 首次扫描时为每条安全规则在 alert_rules 表创建记录（metric='security'），返回 ruleId */
  private async ensureSecurityRuleId(ruleKey: string, scope: RequestScope): Promise<string> {
    const t = scopedDb(scope);
    const existing = await db.select().from(t.alertRules)
      .where(eq(t.alertRules.name, `security.${ruleKey}`)).limit(1);
    if (existing.length > 0) return existing[0].id;
    const [created] = await db.insert(t.alertRules).values({
      name: `security.${ruleKey}`,
      metric: 'security',
      condition: 'auto',
      duration: '0m',
      severity: 'critical',
      actions: { notify: ['webhook'] },
      enabled: true,
    }).returning();
    return created.id;
  }
}
```

### 关键设计决策

1. **规则可配置**：通过 `enabledRules` 数组开关单条规则，生产环境可关闭某些噪音规则
2. **去重策略**：扫描前查询 `alerts` 表，若同 `resourceId` + 同 `ruleId` 已有 `firing` 状态告警，不再重复写入
3. **告警规则自动创建**：首次扫描时为每条安全规则在 `alert_rules` 表创建记录（`metric='security'`），复用现有告警引擎
4. **knowledge_base 用途**：AI Agent 调用 `security_scan` 工具时，从 knowledge_base 检索最新发现，生成结构化报告
5. **demo schema seed**：demo-data.sql 中新增 4-5 条安全问题数据（如 demo 实例暴露公网、未加密磁盘）

---

## Section 2: 容量规划扩展

**核心思路**：扩展现有 `prediction-engine.ts`，从"仅预测何时超阈值"升级为"预测 + 推荐扩容方案"。

### 现状 vs 增强

| 维度 | 现有 | 增强 |
|------|------|------|
| 预测指标 | disk_utilization, memory_utilization | + cpu_utilization |
| 输出 | hoursToThreshold, slope | + recommendation（扩容方案） |
| 告警触发 | 仅超阈值时 | + 容量建议级（confidence > 0.7 且 hoursToThreshold < 72h） |
| knowledge_base | 不写 | 写入容量建议（供 Dashboard + Agent 检索） |

### 扩容推荐算法

```typescript
// prediction-engine.ts 新增
interface CapacityRecommendation {
  instanceId: string;
  instanceName: string;
  metricName: string;
  currentValue: number;
  predictedValue: number;
  hoursToThreshold: number;
  confidence: number;
  recommendation: {
    action: 'scale_up' | 'scale_out' | 'no_action';
    targetSpec?: string;      // '4C8G' → '8C16G'
    reason: string;           // "内存预计 48 小时内超 90%，当前 4C8G 建议升配至 8C16G"
    estimatedCostDelta?: number; // 月增 $40
  };
}

private generateRecommendation(
  inst: Instance,
  metric: string,
  prediction: PredictionResult
): CapacityRecommendation {
  // 规则：hoursToThreshold < 72h 且 confidence > 0.7 才推荐
  const shouldScale = prediction.hoursToThreshold < 72 && prediction.confidence > 0.7;
  
  if (!shouldScale) {
    return { ...base, recommendation: { action: 'no_action', reason: '当前容量充足' } };
  }
  
  // 根据瓶颈指标推荐规格
  const currentSpec = `${inst.cpu}C${inst.memoryMb / 1024}G`;
  let targetSpec = currentSpec;
  if (metric === 'memory_utilization') {
    targetSpec = `${inst.cpu}C${(inst.memoryMb / 1024) * 2}G`;  // 内存翻倍
  } else if (metric === 'cpu_utilization') {
    targetSpec = `${inst.cpu * 2}C${inst.memoryMb / 1024}G`;     // CPU 翻倍
  } else if (metric === 'disk_utilization') {
    targetSpec = `${inst.cpu}C${inst.memoryMb / 1024}G + 磁盘扩容50%`;
  }
  
  return {
    ...base,
    recommendation: {
      action: metric === 'cpu_utilization' ? 'scale_out' : 'scale_up',
      targetSpec,
      reason: `${metric === 'memory_utilization' ? '内存' : metric === 'cpu_utilization' ? 'CPU' : '磁盘'}预计 ${Math.round(prediction.hoursToThreshold)}h 内超阈值，当前 ${currentSpec} 建议升至 ${targetSpec}`,
    },
  };
}
```

### 与现有系统的集成点

1. **不破坏现有逻辑**：`runAll()` 现有的阈值预测逻辑保留，在写入 `metric_predictions` 表后，追加调用 `generateRecommendation()` 
2. **knowledge_base 写入**：当 `recommendation.action != 'no_action'` 时，写入 knowledge_base（`metricName='capacity'`，`symptom` 记录瓶颈描述，`rootCause` 记录推荐方案）
3. **告警升级**：现有 alerts 触发条件不变，容量建议走 knowledge_base 路径，不会产生噪音告警
4. **demo 数据**：demo-data.sql 中已有 `metric_predictions` 数据（48 条），新增几条 hoursToThreshold < 72 的预测，让 Dashboard 能展示扩容建议

### 为什么不新建表

- 扩容建议是预测结果的衍生，生命周期与 prediction 绑定
- knowledge_base 已有 `metricName` 字段可区分 `security` / `capacity` / `alert`
- Dashboard 通过 `knowledge_base WHERE metricName='capacity'` 检索

---

## Section 3: API 端点与 Agent 工具

### 新增 API 端点（monitor-service）

```
GET  /api/monitor/security/findings      → 获取安全扫描发现列表
GET  /api/monitor/security/summary       → 安全风险汇总（critical/warning 计数 + 按规则分组）
POST /api/monitor/security/scan           → 手动触发扫描（需 admin 权限）
GET  /api/monitor/capacity/recommendations → 获取容量扩容建议列表
GET  /api/monitor/capacity/summary        → 容量风险汇总（按实例分组）
```

**关键设计**：所有端点都走现有 scope 注入机制（`request.scope`），demo 模式返回 demo 数据，真实模式返回真实数据。

```typescript
// monitor-service/src/routes/security.ts
app.get('/findings', async (request) => {
  const t = scopedDb(request.scope);
  // 从 knowledge_base 检索 security 类发现
  return await db.select().from(t.knowledgeBase)
    .where(eq(t.knowledgeBase.metricName, 'security'))
    .orderBy(desc(t.knowledgeBase.createdAt))
    .limit(50);
});

app.get('/summary', async (request) => {
  const t = scopedDb(request.scope);
  const findings = await db.select().from(t.knowledgeBase)
    .where(eq(t.knowledgeBase.metricName, 'security'));
  
  // byRule: 按 symptom 关键词分组的辅助函数（如 "公网暴露" → 3 条）
  const byRule: Record<string, number> = {};
  for (const f of findings) {
    const ruleKey = extractRuleKey(f.symptom);  // 从 symptom 提取规则关键词
    byRule[ruleKey] = (byRule[ruleKey] || 0) + 1;
  }
  
  // lastScannedAt: 查询最近一条 security 记录的创建时间
  const latest = await db.select().from(t.knowledgeBase)
    .where(eq(t.knowledgeBase.metricName, 'security'))
    .orderBy(desc(t.knowledgeBase.createdAt))
    .limit(1);
  
  return {
    critical: findings.filter(f => f.outcome === 'critical').length,
    warning: findings.filter(f => f.outcome === 'warning').length,
    byRule,
    lastScannedAt: latest[0]?.createdAt || null,
  };
});

app.post('/scan', { preHandler: requireAdmin }, async (request) => {
  // 手动触发，不等待完成，返回任务 ID
  securityScanner.scanOnce(request.scope);
  return { status: 'triggered', message: '安全扫描已触发' };
});
```

### Agent 新增工具（ai-agent）

```typescript
// ai-agent/src/tools/descriptors/security-tools.ts
const securityScanDesc: ToolDescriptor = {
  name: 'security_scan',
  description: '扫描云资源安全风险，检测公开暴露、未加密存储、弱安全组、闲置资源等问题。返回风险列表和修复建议。',
  inputSchema: {
    type: 'object',
    properties: {
      severity: { type: 'string', description: '过滤严重度: critical | warning | all', default: 'all' },
      provider: { type: 'string', description: '按厂商过滤' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'security_scan' },
  sortKey: '10',
  dangerLevel: 'safe',  // 只读扫描
};

const capacityAnalyzeDesc: ToolDescriptor = {
  name: 'capacity_analyze',
  description: '分析资源容量瓶颈，预测哪些实例即将超载，给出扩容建议（升配/扩容）和预计时间。',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: '指定实例 ID 分析（可选，不填则全量分析）' },
      metric: { type: 'string', description: 'cpu_utilization | memory_utilization | disk_utilization | all', default: 'all' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'capacity_analyze' },
  sortKey: '11',
  dangerLevel: 'safe',
};
```

### 工具执行器

```typescript
// 执行器调用 monitor-service API（通过 HTTP）
const securityScanExecutor: ToolExecutor = {
  async execute(input, ctx) {
    const resp = await fetch(`${config.monitorServiceUrl}/monitor/security/summary`, {
      headers: { 'x-demo-mode': ctx.scope.isDemo ? 'true' : 'false' },
    });
    const summary = await resp.json();
    
    // 若有 critical 发现，附上建议
    let response = `安全扫描结果：${summary.critical} 个严重问题，${summary.warning} 个警告\n\n`;
    if (summary.critical > 0) {
      const findings = await fetch(`${config.monitorServiceUrl}/monitor/security/findings`, {...});
      response += formatFindings(await findings.json());
      response += '\n\n建议：对 critical 问题立即处理，可通过 remediation 流程自动修复。';
    }
    return { text: response, data: summary };
  }
};
```

### 关键设计决策

1. **工具只读**：两个工具都是 `dangerLevel: 'safe'`，只查询不修改，符合 Plan mode 约束
2. **scope 透传**：Agent 工具调用时透传 `x-demo-mode` header，demo 模式返回 demo 发现
3. **手动触发扫描**：`POST /scan` 需 admin 权限，避免被普通用户滥用
4. **复用 monitor-service 端口**：不新增服务，路由注册到现有 monitor-service Fastify 实例

---

## Section 4: 前端 Dashboard 集成

### 新增两个 Dashboard 卡片

复用现有 Dashboard 布局，在 AI 洞察面板下方新增两个卡片：

**1. 安全风险卡片（SecurityCard）**

```
┌─────────────────────────────────────────────┐
│ 🛡️ 安全风险                        [查看详情]│
├─────────────────────────────────────────────┤
│  ⚠️ 2 个严重问题   ⚡ 3 个警告              │
│                                             │
│  严重：                                      │
│  • web-prod-01 公网暴露 (54.221.10.5)       │
│  • db-staging-01 磁盘未加密                  │
│                                             │
│  警告：                                      │
│  • api-worker-02 闲置 7 天                  │
│  • nginx-gateway 安全组 0.0.0.0/0:22        │
└─────────────────────────────────────────────┘
```

**2. 容量建议卡片（CapacityCard）**

```
┌─────────────────────────────────────────────┐
│ 📊 容量规划                        [查看详情]│
├─────────────────────────────────────────────┤
│  🔴 1 个紧急      🟡 2 个建议              │
│                                             │
│  紧急：                                      │
│  • analytics-worker 内存预计 48h 超阈值      │
│    16C32G → 建议 16C64G （月增 $105）       │
│                                             │
│  建议：                                      │
│  • web-prod-01 磁盘预计 120h 超阈值          │
│    建议扩容 50%                              │
└─────────────────────────────────────────────┘
```

### 新增页面：安全详情 & 容量详情

从卡片"查看详情"链接跳转：

**Monitor 页新增 Tab：Security**（与现有 Alerts / Predictions / Remediation / Knowledge Base 并列）

```
┌──────────────────────────────────────────────────────────────┐
│ Monitor                                                      │
│ [Alerts] [Predictions] [Remediation] [Knowledge] [Security] │
├──────────────────────────────────────────────────────────────┤
│  过滤：[全部 ▾] [厂商 ▾] [严重度 ▾]          [🔄 刷新扫描]  │
│                                                              │
│  资源          | 厂商   | 严重度 | 规则         | 发现时间  │
│  web-prod-01   | aws    | 🔴严重 | 公网暴露     | 2h前      │
│  db-staging-01 | aws    | 🔴严重 | 磁盘未加密   | 2h前      │
│  ...                                                        │
└──────────────────────────────────────────────────────────────┘
```

### 文件结构

```
web-console/src/
├── components/
│   ├── dashboard/
│   │   ├── SecurityCard.tsx       (新增) 安全风险卡片
│   │   └── CapacityCard.tsx       (新增) 容量建议卡片
│   └── monitor/
│       └── SecurityTab.tsx        (新增) 安全详情 Tab
├── api/
│   ├── security.ts                (新增) GET /security/findings, /security/summary, POST /security/scan
│   └── capacity.ts                (新增) GET /capacity/recommendations, /capacity/summary
├── hooks/
│   ├── useSecurity.ts             (新增) useQuery 封装
│   └── useCapacity.ts             (新增)
└── pages/
    └── Dashboard.tsx              (修改) 挂载两个新卡片
    └── Monitor.tsx                (修改) 新增 Security Tab
```

### i18n 与 demo 模式

- 新增 i18n 键值：`security.title`、`security.critical`、`security.warning`、`capacity.title`、`capacity.urgent`、`capacity.recommend`（中英文）
- demo 模式：SecurityCard / CapacityCard 从 demo schema 获取数据，DemoBanner 横幅提示生效
- 卡片点击交互：点击单条发现 → 跳转到该资源详情页（复用现有拓扑/实例详情）

---

## Section 5: Demo 数据与 Remediation 闭环

### Demo 安全数据（scripts/demo-data.sql 新增）

基于现有 8 个 demo 实例，构造真实的安全发现：

```sql
-- ========== 安全扫描规则（alert_rules 表）==========
-- 5 条安全规则，metric='security'
INSERT INTO demo.alert_rules (id, name, metric, condition, duration, severity, actions, enabled) VALUES
('d5e6f7a8-0001-4000-8000-000000000001', '公网暴露检测', 'security', 'publicIp IS NOT NULL', '0m', 'critical', '{"notify":["webhook"]}'::jsonb, true),
('d5e6f7a8-0001-4000-8000-000000000002', '磁盘未加密', 'security', 'encrypted=false', '0m', 'critical', '{"notify":["webhook"]}'::jsonb, true),
('d5e6f7a8-0001-4000-8000-000000000003', '闲置资源', 'security', 'lastSyncedAt < 7d', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true),
('d5e6f7a8-0001-4000-8000-000000000004', '安全组过宽', 'security', '0.0.0.0/0 + sensitive port', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true),
('d5e6f7a8-0001-4000-8000-000000000005', '对象存储未加密', 'security', 'encryption!=SSE', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true);

-- ========== 安全发现 → alerts（critical 类）==========
-- web-prod-01 (aws) 公网暴露 54.221.10.5
INSERT INTO demo.alerts (id, rule_id, instance_id, severity, message, status, fired_at) VALUES
('e6f7a8b9-0001-4000-8000-000000000001', 'd5e6f7a8-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'critical', 'web-prod-01 公网 IP 54.221.10.5 暴露，建议绑定 WAF 或限制访问', 'firing', NOW() - INTERVAL '2 hour'),
-- ml-training-gpu (azure) 磁盘未加密
('e6f7a8b9-0001-4000-8000-000000000002', 'd5e6f7a8-0001-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000007', 'critical', 'ml-training-gpu 磁盘未加密，存在数据泄露风险', 'firing', NOW() - INTERVAL '2 hour');

-- ========== 安全发现 → knowledge_base（全部）==========
-- 5 条 knowledge_base 记录，metricName='security'
INSERT INTO demo.knowledge_base (id, alert_id, symptom, metric_name, instance_provider, root_cause, action_taken, outcome) VALUES
('f7a8b9c0-0001-4000-8000-000000000001', 'e6f7a8b9-0001-4000-8000-000000000001', 'web-prod-01 公网 IP 54.221.10.5 暴露', 'security', 'aws', '建议绑定安全组仅放行 443 端口，或配置 WAF', 'pending', 'critical'),
('f7a8b9c0-0001-4000-8000-000000000002', 'e6f7a8b9-0001-4000-8000-000000000002', 'ml-training-gpu 磁盘未加密', 'security', 'azure', '建议启用 Azure Disk Encryption 或平台级加密', 'pending', 'critical'),
('f7a8b9c0-0001-4000-8000-000000000003', NULL, 'api-worker-02 闲置 7 天', 'security', 'aws', '建议关机或降配以节省成本', 'pending', 'warning'),
('f7a8b9c0-0001-4000-8000-000000000004', NULL, 'nginx-gateway 安全组开放 0.0.0.0/0:22', 'security', 'aliyun', '建议限制 SSH 访问源为运维 VPN 段', 'pending', 'warning'),
('f7a8b9c0-0001-4000-8000-000000000005', NULL, 'redis-cache 对象存储未启用 SSE', 'security', 'aliyun', '建议启用服务端加密 SSE-KMS', 'pending', 'warning');

-- ========== 容量建议 → knowledge_base（metricName='capacity'）==========
INSERT INTO demo.knowledge_base (id, symptom, metric_name, instance_provider, root_cause, action_taken, outcome) VALUES
('f7a8b9c0-0002-4000-8000-000000000001', 'analytics-worker 内存预计 48h 超 90%', 'capacity', 'aliyun', '16C32G → 16C64G，月增 $105', 'pending', 'urgent'),
('f7a8b9c0-0002-4000-8000-000000000002', 'web-prod-01 磁盘预计 120h 超阈值', 'capacity', 'aws', '磁盘扩容 50%', 'pending', 'recommend');

-- ========== 容量预测 → metric_predictions（补充 hoursToThreshold<72 的记录）==========
-- analytics-worker 内存预测（已有表，补充 1 条紧急）
INSERT INTO demo.metric_predictions (instance_id, metric_name, current_value, predicted_value, threshold, hours_to_threshold, slope, confidence) VALUES
('a1b2c3d4-0001-4000-8000-000000000006', 'memory_utilization', 85.2, 92.5, 90, 48, 0.15, 0.85);
```

### Remediation 闭环集成

安全发现可触发自动修复，复用现有 `remediation-engine.ts` 的 demo 模拟执行：

```typescript
// monitor-service/src/services/remediation-engine.ts (扩展)
private async generateRemediationForSecurity(scope: RequestScope) {
  const t = scopedDb(scope);
  // 查询 critical 安全告警：关联 alert_rules.metric='security' 且无对应 remediation_run
  const securityRuleIds = await db.select().from(t.alertRules)
    .where(eq(t.alertRules.metric, 'security'));
  const ruleIdList = securityRuleIds.map(r => r.id);
  
  const criticalAlerts = await db.select().from(t.alerts)
    .where(and(
      eq(t.alerts.status, 'firing'),
      eq(t.alerts.severity, 'critical'),
      inArray(t.alerts.ruleId, ruleIdList),
    ));
  
  for (const alert of criticalAlerts) {
    // demo 模式：直接写 success，模拟已修复
    await db.insert(t.remediationRuns).values({
      alertId: alert.id,
      rootCause: alert.message,
      actionPlan: { action: 'security_fix', recommendation: '...' },
      actionExecuted: scope.isDemo ? 'simulate' : null,
      status: scope.isDemo ? 'success' : 'pending',  // demo 模式自动 success
      env: scope.schema,
      triggeredAt: new Date(),
      verifiedAt: scope.isDemo ? new Date() : null,
      verificationResult: scope.isDemo ? 'demo 模拟修复成功' : null,
    });
  }
}
```

### 关键设计决策

1. **demo 安全规则独立 ID 段**：用 `d5e6f7a8-*` 前缀，避免与现有 `b2c3d4e5-*` 告警规则冲突
2. **knowledge_base 的 outcome 字段复用**：`critical` / `warning` / `urgent` / `recommend` 存储严重度+优先级，Dashboard 按此分组
3. **remediation 闭环**：demo 模式 critical 安全发现自动生成 `success` 状态的修复记录，展示闭环；真实模式需人工审批
4. **metric_predictions 补充**：确保 analytics-worker 有 hoursToThreshold<72 的记录，触发容量建议

---

## Section 6: 定时调度、错误处理与边界情况

### 定时调度

**SecurityScanner 调度**（与 prediction-engine 同模式）：

```typescript
// monitor-service/src/services/security-scanner.ts
export class SecurityScanner {
  private timer: NodeJS.Timeout | null = null;

  start() {
    const intervalMs = config.securityScanIntervalSec * 1000; // 默认 6h
    this.timer = setInterval(() => this.runCycle().catch(console.error), intervalMs);
    console.log(`Security scanner started (interval: ${config.securityScanIntervalSec}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  // 与 prediction-engine 一致的双跑
  private async runCycle(): Promise<void> {
    try { await this.scanAll(PUBLIC_SCOPE); } catch (err) {
      console.error('Security scan public failed:', (err as Error).message);
    }
    try { await this.scanAll(DEMO_SCOPE); } catch (err) {
      console.error('Security scan demo failed:', (err as Error).message);
    }
  }

  // 供 POST /scan 手动触发
  async scanOnce(scope: RequestScope): Promise<void> {
    await this.scanAll(scope);
  }
}
```

**config 扩展**（monitor-service/src/config.ts）：

```typescript
export const config = {
  ...existing,
  securityScanIntervalSec: parseInt(process.env.SECURITY_SCAN_INTERVAL_SEC || '21600'), // 6h
  securityEnabledRules: (process.env.SECURITY_ENABLED_RULES || 'public_exposure,unencrypted_disk,unencrypted_storage,idle_resource,weak_security_group').split(','),
  securityScanEnabled: process.env.SECURITY_SCAN_ENABLED !== 'false', // 默认开启
};
```

**启动注册**（monitor-service/src/index.ts）：

```typescript
import { SecurityScanner } from './services/security-scanner.js';
const securityScanner = new SecurityScanner();

if (config.securityScanEnabled) {
  securityScanner.start();
  // 启动后立即跑一次首次扫描（避免等 6h）
  securityScanner.scanOnce(PUBLIC_SCOPE).catch(console.error);
  securityScanner.scanOnce(DEMO_SCOPE).catch(console.error);
}

// 优雅关闭
process.on('SIGTERM', () => {
  predictionEngine.stop();
  securityScanner.stop();
});
```

### 错误处理策略

| 错误场景 | 处理方式 |
|---------|---------|
| 单条规则检测异常 | try-catch 包裹单规则，记录日志，继续其他规则 |
| 数据库写入失败 | fire-and-forget，记录 error 日志，不阻断扫描 |
| cloud_resources 表为空 | 跳过扫描，记录 info 日志 |
| 手动触发 scan 时已有扫描在跑 | 返回 409 Conflict + "扫描进行中" |
| LLM 不可用（AI 分析） | 跳过 AI 分析，仍写入基础 finding |
| demo schema 未就绪 | catch 异常，记录警告，不影响 public 扫描 |

### 去重逻辑（关键边界情况）

```typescript
private async persistFindings(findings: SecurityFinding[], scope: RequestScope) {
  const t = scopedDb(scope);
  
  for (const f of findings) {
    // 查询是否已有同资源 + 同规则的未解决告警
    const existing = await db.select().from(t.alerts)
      .where(and(
        eq(t.alerts.ruleId, f.ruleDbId),
        eq(t.alerts.instanceId, f.instanceId),
        eq(t.alerts.status, 'firing'),
      ))
      .limit(1);
    
    if (existing.length > 0) {
      // 已存在未解决告警，跳过（避免重复告警）
      continue;
    }
    
    // 同资源同规则在 knowledge_base 中 24h 内已有记录，也跳过
    const recentKb = await db.select().from(t.knowledgeBase)
      .where(and(
        eq(t.knowledgeBase.metricName, 'security'),
        // symptom LIKE '%resourceName%'
        gte(t.knowledgeBase.createdAt, new Date(Date.now() - 24 * 3600 * 1000)),
      ))
      .limit(1);
    
    if (recentKb.length > 0) {
      continue;
    }
    
    // 写入新 finding
    await this.writeFinding(f, scope);
  }
}
```

### 边界情况处理

1. **cloud_resources 表无数据**（新部署未同步）
   - 扫描器正常返回空结果，不报错
   - Dashboard 显示"暂无安全数据，请先同步云资源"

2. **resource.attributes 字段缺失**
   - 每条规则做防御性检查：`if (!resource.attributes) return [];`
   - 缺字段视为"无法判定"，不误报

3. **demo 模式下手动触发 scan**
   - 允许触发，但只扫描 demo schema
   - 返回结果带 `"scope": "demo"` 标识

4. **remediation 自动执行**
   - 真实模式：critical 安全发现生成 `status='pending'` 的 remediation_run，需人工 approve
   - demo 模式：自动生成 `status='success'` 展示闭环
   - 防止重复生成：检查同 alertId 是否已有 remediation_run

5. **容量预测置信度低**
   - confidence < 0.5 时不生成 recommendation
   - Dashboard 显示"数据不足，需更多采样"

### 测试策略

- **单元测试**：每条规则的 `detect()` 函数纯函数测试，输入 mock resources 数组，输出 findings
- **集成测试**：scanAll 写入测试数据库，验证 alerts + knowledge_base 正确创建
- **去重测试**：连续两次扫描，第二次不应产生重复告警
- **demo 隔离测试**：public 扫描不影响 demo 数据，反之亦然

---

## 文件清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `monitor-service/src/services/security-scanner.ts` | 安全扫描引擎（5 规则 + 双跑 + 去重） |
| `monitor-service/src/routes/security.ts` | 安全 API 端点（findings/summary/scan） |
| `monitor-service/src/routes/capacity.ts` | 容量 API 端点（recommendations/summary） |
| `ai-agent/src/tools/descriptors/security-tools.ts` | Agent 工具描述符（security_scan, capacity_analyze） |
| `web-console/src/components/dashboard/SecurityCard.tsx` | Dashboard 安全风险卡片 |
| `web-console/src/components/dashboard/CapacityCard.tsx` | Dashboard 容量建议卡片 |
| `web-console/src/components/monitor/SecurityTab.tsx` | Monitor 页安全详情 Tab |
| `web-console/src/api/security.ts` | 前端 API 客户端（security） |
| `web-console/src/api/capacity.ts` | 前端 API 客户端（capacity） |
| `web-console/src/hooks/useSecurity.ts` | React Hook（security） |
| `web-console/src/hooks/useCapacity.ts` | React Hook（capacity） |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `monitor-service/src/services/prediction-engine.ts` | 新增 generateRecommendation() + knowledge_base 写入 |
| `monitor-service/src/services/remediation-engine.ts` | 新增 generateRemediationForSecurity() |
| `monitor-service/src/index.ts` | 注册 SecurityScanner + 启动 |
| `monitor-service/src/config.ts` | 新增 securityScan 配置 |
| `ai-agent/src/tools/registry.ts` | 注册 security_scan, capacity_analyze 工具 |
| `scripts/demo-data.sql` | 新增安全 + 容量 demo 数据 |
| `web-console/src/pages/Dashboard.tsx` | 挂载 SecurityCard + CapacityCard |
| `web-console/src/pages/Monitor.tsx` | 新增 Security Tab |
| `web-console/src/i18n/locales/en.json` | 新增 security/capacity 键值 |
| `web-console/src/i18n/locales/zh.json` | 新增 security/capacity 键值 |

### 不修改

- 数据库 schema（复用现有表）
- Docker 配置（不新增服务）
- nginx 路由（复用现有 /api/monitor/* 代理）
