# 智能运维 + 安全合规扫描 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展现有 AIOps 平台，新增安全合规扫描（5 类规则）与容量规划（扩容推荐）能力，通过 Agent 工具 + Dashboard 卡片 + Demo 数据闭环展示。

**Architecture:** 在 monitor-service 内新增 security-scanner 服务（双跑 public/demo），扩展现有 prediction-engine 加容量推荐；新增 5 个 API 端点 + 2 个 Agent 工具 + 2 个 Dashboard 卡片 + 1 个 Monitor Tab；demo 数据写入 demo schema 复用现有表。

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, React, TanStack Query, i18n

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `monitor-service/src/services/security-scanner.ts` | 安全扫描引擎（5 规则 + 双跑 + 去重） |
| `monitor-service/src/routes/security.ts` | 安全 API 端点（findings/summary/scan） |
| `monitor-service/src/routes/capacity.ts` | 容量 API 端点（recommendations/summary） |
| `ai-agent/src/tools/descriptors/security-tools.ts` | Agent 工具描述符 + 执行器 |
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
| `monitor-service/src/index.ts` | 注册 SecurityScanner + 路由 + 启动 |
| `monitor-service/src/config.ts` | 新增 securityScan 配置项 |
| `scripts/demo-data.sql` | 新增安全规则 + 安全发现 + 容量建议 demo 数据 |
| `web-console/src/pages/Dashboard.tsx` | 挂载 SecurityCard + CapacityCard |
| `web-console/src/pages/Monitor.tsx` | 新增 Security Tab |
| `web-console/src/i18n/locales/en.json` | 新增 security/capacity 键值 |
| `web-console/src/i18n/locales/zh.json` | 新增 security/capacity 键值 |

---

## Task 1: 安全扫描器核心 - 规则定义与检测

**Files:**
- Create: `monitor-service/src/services/security-scanner.ts`

- [ ] **Step 1: 创建 security-scanner.ts 基础结构**

创建文件 `monitor-service/src/services/security-scanner.ts`：

```typescript
// monitor-service/src/services/security-scanner.ts
import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE, DEMO_SCOPE, type RequestScope } from '@cloudops/shared';
import { eq, and, gte, desc, inArray } from 'drizzle-orm';
import { config } from '../config.js';

/** 安全发现 */
export interface SecurityFinding {
  ruleId: string;           // 'public_exposure' | 'unencrypted_disk' | ...
  resourceId: string;       // cloud_resources.id
  resourceName: string;
  provider: string;
  region: string;
  severity: 'critical' | 'warning';
  message: string;          // 人类可读描述
  recommendation: string;   // 修复建议
  evidence: Record<string, any>;
}

/** 安全扫描规则接口 */
interface SecurityRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning';
  detect(resources: any[]): SecurityFinding[];
}

// 敏感端口列表
const SENSITIVE_PORTS = [22, 3306, 6379, 27017, 9200];

// ========== 规则 1: 公网暴露 ==========
const publicExposureRule: SecurityRule = {
  id: 'public_exposure',
  name: '公网暴露检测',
  severity: 'critical',
  detect(resources: any[]): SecurityFinding[] {
    return resources
      .filter((r) => {
        if (!r.attributes) return false;
        const publicIp = r.attributes.publicIp || r.publicIp;
        const tags = r.tags || {};
        // sandbox 环境允许公网暴露
        return publicIp && tags.env !== 'sandbox';
      })
      .map((r) => ({
        ruleId: 'public_exposure',
        resourceId: r.id,
        resourceName: r.name || r.providerResourceId,
        provider: r.provider,
        region: r.region || '',
        severity: 'critical' as const,
        message: `${r.name || r.providerResourceId} 公网 IP ${r.attributes.publicIp || r.publicIp} 暴露`,
        recommendation: '建议绑定安全组仅放行 443 端口，或配置 WAF 限制访问',
        evidence: { publicIp: r.attributes.publicIp || r.publicIp },
      }));
  },
};

// ========== 规则 2: 磁盘未加密 ==========
const unencryptedDiskRule: SecurityRule = {
  id: 'unencrypted_disk',
  name: '磁盘未加密',
  severity: 'critical',
  detect(resources: any[]): SecurityFinding[] {
    return resources
      .filter((r) => {
        if (!r.attributes) return false;
        return r.resourceType === 'disk' && r.attributes.encrypted === false;
      })
      .map((r) => ({
        ruleId: 'unencrypted_disk',
        resourceId: r.id,
        resourceName: r.name || r.providerResourceId,
        provider: r.provider,
        region: r.region || '',
        severity: 'critical' as const,
        message: `${r.name || r.providerResourceId} 磁盘未加密，存在数据泄露风险`,
        recommendation: '建议启用云平台磁盘加密服务（AWS EBS Encryption / Azure Disk Encryption）',
        evidence: { encrypted: false },
      }));
  },
};

// ========== 规则 3: 对象存储未加密 ==========
const unencryptedStorageRule: SecurityRule = {
  id: 'unencrypted_storage',
  name: '对象存储未加密',
  severity: 'warning',
  detect(resources: any[]): SecurityFinding[] {
    return resources
      .filter((r) => {
        if (!r.attributes) return false;
        return r.resourceType === 'bucket' && r.attributes.encryption !== 'SSE';
      })
      .map((r) => ({
        ruleId: 'unencrypted_storage',
        resourceId: r.id,
        resourceName: r.name || r.providerResourceId,
        provider: r.provider,
        region: r.region || '',
        severity: 'warning' as const,
        message: `${r.name || r.providerResourceId} 对象存储未启用服务端加密`,
        recommendation: '建议启用服务端加密 SSE-KMS 或 SSE-S3',
        evidence: { encryption: r.attributes.encryption },
      }));
  },
};

// ========== 规则 4: 闲置资源 ==========
const idleResourceRule: SecurityRule = {
  id: 'idle_resource',
  name: '闲置资源',
  severity: 'warning',
  detect(resources: any[]): SecurityFinding[] {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return resources
      .filter((r) => {
        if (!r.attributes) return false;
        const lastSynced = r.lastSyncedAt ? new Date(r.lastSyncedAt) : null;
        const isIdle = (lastSynced && lastSynced < sevenDaysAgo) || r.status === 'stopped';
        const hasCost = r.attributes.monthlyCost && r.attributes.monthlyCost > 0;
        return isIdle && hasCost;
      })
      .map((r) => ({
        ruleId: 'idle_resource',
        resourceId: r.id,
        resourceName: r.name || r.providerResourceId,
        provider: r.provider,
        region: r.region || '',
        severity: 'warning' as const,
        message: `${r.name || r.providerResourceId} 闲置超过 7 天，月费 $${r.attributes.monthlyCost}`,
        recommendation: '建议关机或降配以节省成本',
        evidence: { lastSyncedAt: r.lastSyncedAt, monthlyCost: r.attributes.monthlyCost },
      }));
  },
};

// ========== 规则 5: 安全组规则过宽 ==========
const weakSecurityGroupRule: SecurityRule = {
  id: 'weak_security_group',
  name: '安全组规则过宽',
  severity: 'warning',
  detect(resources: any[]): SecurityFinding[] {
    return resources
      .filter((r) => {
        if (!r.attributes || !r.attributes.rules) return false;
        if (r.resourceType !== 'securitygroup') return false;
        return r.attributes.rules.some((rule: any) => {
          const isOpen = rule.cidr === '0.0.0.0/0';
          const port = parseInt(rule.port, 10);
          return isOpen && SENSITIVE_PORTS.includes(port);
        });
      })
      .map((r) => ({
        ruleId: 'weak_security_group',
        resourceId: r.id,
        resourceName: r.name || r.providerResourceId,
        provider: r.provider,
        region: r.region || '',
        severity: 'warning' as const,
        message: `${r.name || r.providerResourceId} 安全组开放 0.0.0.0/0:敏感端口`,
        recommendation: '建议限制 SSH/DB 访问源为运维 VPN 段',
        evidence: { rules: r.attributes.rules },
      }));
  },
};

// 所有规则
const ALL_RULES: SecurityRule[] = [
  publicExposureRule,
  unencryptedDiskRule,
  unencryptedStorageRule,
  idleResourceRule,
  weakSecurityGroupRule,
];

export class SecurityScanner {
  private timer: NodeJS.Timeout | null = null;
  private rules: SecurityRule[];
  private scanning = false;

  constructor() {
    // 按 config 过滤启用的规则
    this.rules = ALL_RULES.filter((r) => config.securityEnabledRules.includes(r.id));
  }

  start() {
    const intervalMs = config.securityScanIntervalSec * 1000;
    this.timer = setInterval(() => this.runCycle().catch(console.error), intervalMs);
    console.log(`Security scanner started (interval: ${config.securityScanIntervalSec}s, rules: ${this.rules.map(r => r.id).join(',')})`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCycle(): Promise<void> {
    // 双跑：public 和 demo
    try { await this.scanAll(PUBLIC_SCOPE); } catch (err) {
      console.error('Security scan public failed:', (err as Error).message);
    }
    try { await this.scanAll(DEMO_SCOPE); } catch (err) {
      console.error('Security scan demo failed:', (err as Error).message);
    }
  }

  async scanOnce(scope: RequestScope): Promise<void> {
    if (this.scanning) {
      throw new Error('Scan already in progress');
    }
    await this.scanAll(scope);
  }

  private async scanAll(scope: RequestScope): Promise<void> {
    this.scanning = true;
    try {
      const t = scopedDb(scope);
      const resources = await db.select().from(t.cloudResources);
      
      if (resources.length === 0) {
        console.log(`Security scan ${scope.schema}: no resources, skip`);
        return;
      }

      const findings: SecurityFinding[] = [];
      for (const rule of this.rules) {
        try {
          const hits = rule.detect(resources);
          findings.push(...hits);
        } catch (err) {
          console.error(`Security rule ${rule.id} failed:`, (err as Error).message);
        }
      }

      await this.persistFindings(findings, scope);
      console.log(`Security scan ${scope.schema}: ${findings.length} findings (${findings.filter(f => f.severity === 'critical').length} critical)`);
    } finally {
      this.scanning = false;
    }
  }

  private async persistFindings(findings: SecurityFinding[], scope: RequestScope): Promise<void> {
    const t = scopedDb(scope);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const f of findings) {
      try {
        // 去重 1：critical 类查询 alerts 表是否已有 firing 告警
        if (f.severity === 'critical') {
          const existingAlert = await db.select().from(t.alerts)
            .where(and(
              eq(t.alerts.severity, 'critical'),
              eq(t.alerts.status, 'firing'),
            ))
            .limit(50);

          // 检查 message 是否包含 resourceName（简单去重）
          const duplicate = existingAlert.some(a => a.message?.includes(f.resourceName));
          if (duplicate) continue;

          // 创建/获取安全规则
          const ruleId = await this.ensureSecurityRule(f.ruleId, scope);
          await db.insert(t.alerts).values({
            ruleId,
            instanceId: null,
            severity: 'critical',
            message: f.message,
            status: 'firing',
            firedAt: new Date(),
          });
        }

        // 去重 2：knowledge_base 24h 内已有同 symptom 记录
        const recentKb = await db.select().from(t.knowledgeBase)
          .where(and(
            eq(t.knowledgeBase.metricName, 'security'),
            gte(t.knowledgeBase.createdAt, twentyFourHoursAgo),
          ))
          .limit(100);
        
        const kbDuplicate = recentKb.some(k => k.symptom === f.message);
        if (kbDuplicate) continue;

        // 全部写入 knowledge_base
        await db.insert(t.knowledgeBase).values({
          symptom: f.message,
          metricName: 'security',
          instanceProvider: f.provider,
          rootCause: f.recommendation,
          actionTaken: 'pending',
          outcome: f.severity,
        });
      } catch (err) {
        console.error(`Persist finding failed:`, (err as Error).message);
      }
    }
  }

  /** 首次扫描时为每条安全规则在 alert_rules 表创建记录 */
  private async ensureSecurityRule(ruleKey: string, scope: RequestScope): Promise<string> {
    const t = scopedDb(scope);
    const ruleName = `security.${ruleKey}`;
    const existing = await db.select().from(t.alertRules)
      .where(eq(t.alertRules.name, ruleName))
      .limit(1);
    if (existing.length > 0) return existing[0].id;

    const [created] = await db.insert(t.alertRules).values({
      name: ruleName,
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

export const securityScanner = new SecurityScanner();
```

- [ ] **Step 2: 扩展 config.ts 添加 security 配置**

修改文件 `monitor-service/src/config.ts`，在 `config` 对象末尾（`predictionMinConfidence` 后）添加：

```typescript
  // 安全扫描配置
  securityScanIntervalSec: parseInt(process.env.SECURITY_SCAN_INTERVAL_SEC || '21600', 10), // 默认 6 小时
  securityEnabledRules: (process.env.SECURITY_ENABLED_RULES || 'public_exposure,unencrypted_disk,unencrypted_storage,idle_resource,weak_security_group').split(','),
  securityScanEnabled: process.env.SECURITY_SCAN_ENABLED !== 'false', // 默认开启
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 编译通过（可能有现有警告，但无 error）

- [ ] **Step 4: Commit**

```bash
git add monitor-service/src/services/security-scanner.ts monitor-service/src/config.ts
git commit -m "feat: add security scanner with 5 detection rules"
```

---

## Task 2: 注册 SecurityScanner 到 monitor-service 启动流程

**Files:**
- Modify: `monitor-service/src/index.ts`

- [ ] **Step 1: 修改 index.ts 注册 scanner 和路由**

在 `monitor-service/src/index.ts` 中：

1) 添加 import（在现有 predictionEngine import 后）：

```typescript
import { securityScanner } from './services/security-scanner.js';
import { securityRoutes } from './routes/security.js';
import { capacityRoutes } from './routes/capacity.js';
```

2) 在 `await app.register(knowledgeBaseRoutes, ...)` 后添加：

```typescript
await app.register(securityRoutes, { prefix: '/monitor/security' });
await app.register(capacityRoutes, { prefix: '/monitor/capacity' });
```

3) 在 `try { predictionEngine.start(); }` 后添加：

```typescript
try {
  if (config.securityScanEnabled) {
    securityScanner.start();
    // 启动后立即跑一次首次扫描
    securityScanner.scanOnce(PUBLIC_SCOPE).catch((e) => console.error('Initial security scan public failed:', e));
    securityScanner.scanOnce(DEMO_SCOPE).catch((e) => console.error('Initial security scan demo failed:', e));
  }
} catch (e) { console.error('securityScanner failed:', (e as Error).message); }
```

4) 在 `shutdown` 函数的 `predictionEngine.stop();` 后添加：

```typescript
  securityScanner.stop();
```

- [ ] **Step 2: 验证编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 报错找不到 security.ts / capacity.ts（正常，下个 task 创建）

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/index.ts
git commit -m "feat: register security scanner in monitor-service startup"
```

---

## Task 3: 安全 API 端点

**Files:**
- Create: `monitor-service/src/routes/security.ts`

- [ ] **Step 1: 创建 security.ts 路由**

创建文件 `monitor-service/src/routes/security.ts`：

```typescript
// monitor-service/src/routes/security.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc } from 'drizzle-orm';
import { securityScanner } from '../services/security-scanner.js';

export async function securityRoutes(app: FastifyInstance) {
  // 获取安全扫描发现列表（从 knowledge_base 检索）
  app.get('/findings', async (request) => {
    const t = scopedDb(request.scope);
    const findings = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(50);
    return findings;
  });

  // 安全风险汇总
  app.get('/summary', async (request) => {
    const t = scopedDb(request.scope);
    const findings = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'));

    const critical = findings.filter((f) => f.outcome === 'critical').length;
    const warning = findings.filter((f) => f.outcome === 'warning').length;

    // 按规则关键词分组
    const byRule: Record<string, number> = {};
    for (const f of findings) {
      // 从 symptom 提取规则关键词
      let ruleKey = 'other';
      if (f.symptom?.includes('公网')) ruleKey = 'public_exposure';
      else if (f.symptom?.includes('磁盘未加密')) ruleKey = 'unencrypted_disk';
      else if (f.symptom?.includes('对象存储')) ruleKey = 'unencrypted_storage';
      else if (f.symptom?.includes('闲置')) ruleKey = 'idle_resource';
      else if (f.symptom?.includes('安全组')) ruleKey = 'weak_security_group';
      byRule[ruleKey] = (byRule[ruleKey] || 0) + 1;
    }

    // 查询最近扫描时间
    const latest = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'security'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(1);

    return {
      critical,
      warning,
      total: findings.length,
      byRule,
      lastScannedAt: latest[0]?.createdAt || null,
    };
  });

  // 手动触发扫描
  app.post('/scan', async (request, reply) => {
    try {
      await securityScanner.scanOnce(request.scope);
      return { status: 'ok', message: 'Security scan completed' };
    } catch (err) {
      return reply.status(409).send({
        error: 'SCAN_IN_PROGRESS',
        message: (err as Error).message,
      });
    }
  });
}
```

- [ ] **Step 2: 验证编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 仅缺 capacity.ts（下个 task 创建）

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/routes/security.ts
git commit -m "feat: add security API endpoints (findings/summary/scan)"
```

---

## Task 4: 容量 API 端点

**Files:**
- Create: `monitor-service/src/routes/capacity.ts`

- [ ] **Step 1: 创建 capacity.ts 路由**

创建文件 `monitor-service/src/routes/capacity.ts`：

```typescript
// monitor-service/src/routes/capacity.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scopedDb } from '@cloudops/shared';
import { eq, desc, and } from 'drizzle-orm';

export async function capacityRoutes(app: FastifyInstance) {
  // 获取容量扩容建议列表（从 knowledge_base 检索 metricName='capacity'）
  app.get('/recommendations', async (request) => {
    const t = scopedDb(request.scope);
    const recs = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'capacity'))
      .orderBy(desc(t.knowledgeBase.createdAt))
      .limit(50);
    return recs;
  });

  // 容量风险汇总
  app.get('/summary', async (request) => {
    const t = scopedDb(request.scope);
    
    // 从 knowledge_base 获取容量建议
    const recs = await db.select().from(t.knowledgeBase)
      .where(eq(t.knowledgeBase.metricName, 'capacity'));

    const urgent = recs.filter((r) => r.outcome === 'urgent').length;
    const recommend = recs.filter((r) => r.outcome === 'recommend').length;

    // 从 metric_predictions 获取 72h 内的预测
    const predictions = await db.select().from(t.metricPredictions)
      .orderBy(desc(t.metricPredictions.createdAt))
      .limit(100);

    const urgentPredictions = predictions.filter(
      (p) => parseFloat(p.hoursToThreshold) < 72 && parseFloat(p.confidence) > 70
    );

    return {
      urgent,
      recommend,
      total: recs.length,
      urgentPredictions: urgentPredictions.length,
      predictions: urgentPredictions.slice(0, 10).map((p) => ({
        instanceId: p.instanceId,
        metricName: p.metricName,
        currentValue: p.currentValue,
        predictedValue: p.predictedValue,
        hoursToThreshold: p.hoursToThreshold,
        confidence: p.confidence,
      })),
    };
  });
}
```

- [ ] **Step 2: 验证编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add monitor-service/src/routes/capacity.ts
git commit -m "feat: add capacity API endpoints (recommendations/summary)"
```

---

## Task 5: 扩展 prediction-engine 添加容量推荐

**Files:**
- Modify: `monitor-service/src/services/prediction-engine.ts`

- [ ] **Step 1: 在 prediction-engine.ts 末尾添加 generateRecommendation 方法**

在 `prediction-engine.ts` 的 `PredictionEngine` 类内（`createPredictiveAlert` 方法后）添加：

```typescript
  /** 生成容量扩容建议并写入 knowledge_base */
  private async generateCapacityRecommendation(
    scope: RequestScope,
    instanceId: string,
    instanceName: string,
    metricName: string,
    prediction: PredictionResult
  ): Promise<void> {
    // 仅在 hoursToThreshold < 72h 且 confidence > 70 时生成建议
    if (prediction.hoursToThreshold >= 72 || prediction.confidence <= 70) {
      return;
    }

    const t = scopedDb(scope);
    
    // 查询实例规格
    const inst = await db.select().from(t.instances)
      .where(eq(t.instances.id, instanceId))
      .limit(1);
    
    if (inst.length === 0) return;
    const i = inst[0];
    const currentSpec = `${i.cpu}C${(i.memoryMb || 0) / 1024}G`;
    
    let targetSpec = currentSpec;
    let actionLabel = 'scale_up';
    if (metricName === 'memory_utilization') {
      targetSpec = `${i.cpu}C${((i.memoryMb || 0) / 1024) * 2}G`;
    } else if (metricName === 'cpu_utilization') {
      targetSpec = `${(i.cpu || 0) * 2}C${(i.memoryMb || 0) / 1024}G`;
      actionLabel = 'scale_out';
    } else if (metricName === 'disk_utilization') {
      targetSpec = `${currentSpec} + 磁盘扩容50%`;
    }

    const metricLabel = metricName === 'memory_utilization' ? '内存'
      : metricName === 'cpu_utilization' ? 'CPU'
      : '磁盘';

    const symptom = `${instanceName} ${metricLabel}预计 ${Math.round(prediction.hoursToThreshold)}h 超阈值`;
    const rootCause = `${currentSpec} → ${targetSpec}`;

    // 去重：24h 内已有同 symptom 不重复写入
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db.select().from(t.knowledgeBase)
      .where(and(
        eq(t.knowledgeBase.metricName, 'capacity'),
        gte(t.knowledgeBase.createdAt, twentyFourHoursAgo),
      ))
      .limit(100);
    
    if (recent.some((r) => r.symptom === symptom)) return;

    await db.insert(t.knowledgeBase).values({
      symptom,
      metricName: 'capacity',
      instanceProvider: i.provider,
      rootCause,
      actionTaken: 'pending',
      outcome: prediction.hoursToThreshold < 48 ? 'urgent' : 'recommend',
    });
  }
```

同时在文件顶部添加缺少的 import（如果 `and` 未导入）：

```typescript
import { eq, and, gte, desc } from 'drizzle-orm';
```

- [ ] **Step 2: 在 predictForInstance 方法中调用 generateCapacityRecommendation**

在 `prediction-engine.ts` 的 `predictForInstance` 方法中，在 `return result;` 之前（`createPredictiveAlert` 调用后）添加：

```typescript
    // 生成容量扩容建议
    await this.generateCapacityRecommendation(scope, instanceId, instanceName, metricName, result)
      .catch((err) => console.error(`Capacity recommendation for ${instanceId}/${metricName} failed:`, err));
```

- [ ] **Step 3: 扩展 predictionMetrics 添加 cpu_utilization**

在 `runAll` 方法中，将：

```typescript
    const predictionMetrics = ['disk_utilization', 'memory_utilization'];
```

改为：

```typescript
    const predictionMetrics = ['disk_utilization', 'memory_utilization', 'cpu_utilization'];
```

- [ ] **Step 4: 验证编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
git add monitor-service/src/services/prediction-engine.ts
git commit -m "feat: extend prediction engine with capacity recommendations"
```

---

## Task 6: 扩展 remediation-engine 支持安全发现

**Files:**
- Modify: `monitor-service/src/services/remediation-engine.ts`

- [ ] **Step 1: 在 remediation-engine.ts 添加 generateRemediationForSecurity 方法**

先读取现有 `remediation-engine.ts` 末尾，在 `RemediationEngine` 类内添加新方法：

```typescript
  /** 为 critical 安全告警生成 remediation_run（demo 模式自动 success） */
  private async generateRemediationForSecurity(scope: RequestScope): Promise<void> {
    const t = scopedDb(scope);
    
    // 查询所有 metric='security' 的 alert_rules
    const securityRules = await db.select().from(t.alertRules)
      .where(eq(t.alertRules.metric, 'security'));
    const ruleIdList = securityRules.map((r) => r.id);
    
    if (ruleIdList.length === 0) return;
    
    // 查询 critical 安全告警
    const criticalAlerts = await db.select().from(t.alerts)
      .where(and(
        eq(t.alerts.status, 'firing'),
        eq(t.alerts.severity, 'critical'),
        inArray(t.alerts.ruleId, ruleIdList),
      ));
    
    for (const alert of criticalAlerts) {
      // 检查是否已有 remediation_run
      const existing = await db.select().from(t.remediationRuns)
        .where(eq(t.remediationRuns.alertId, alert.id))
        .limit(1);
      if (existing.length > 0) continue;
      
      await db.insert(t.remediationRuns).values({
        alertId: alert.id,
        rootCause: alert.message,
        actionPlan: { action: 'security_fix', recommendation: '自动安全修复' },
        actionExecuted: scope.isDemo ? 'simulate' : null,
        status: scope.isDemo ? 'success' : 'pending',
        env: scope.schema,
        triggeredAt: new Date(),
        verifiedAt: scope.isDemo ? new Date() : null,
        verificationResult: scope.isDemo ? 'demo 模拟修复成功' : null,
      });
    }
  }
```

确保文件顶部 import 包含 `inArray`：

```typescript
import { eq, and, inArray } from 'drizzle-orm';
```

- [ ] **Step 2: 在 runCycle 或主循环中调用 generateRemediationForSecurity**

在 remediation-engine 的 `runCycle()` 或 `runAll(scope)` 方法末尾添加调用：

```typescript
    // 安全告警自动生成 remediation_run
    await this.generateRemediationForSecurity(scope)
      .catch((err) => console.error('Security remediation generation failed:', err));
```

- [ ] **Step 3: 验证编译**

Run: `cd monitor-service && npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add monitor-service/src/services/remediation-engine.ts
git commit -m "feat: extend remediation engine for security findings"
```

---

## Task 7: Agent 工具 - security_scan 和 capacity_analyze

**Files:**
- Create: `ai-agent/src/tools/descriptors/security-tools.ts`

- [ ] **Step 1: 创建 security-tools.ts**

创建文件 `ai-agent/src/tools/descriptors/security-tools.ts`：

```typescript
// ai-agent/src/tools/descriptors/security-tools.ts
// AI Agent 工具：安全扫描 + 容量分析（只读，调用 monitor-service API）

import { toolRegistry } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

const securityScanDesc: ToolDescriptor = {
  name: 'security_scan',
  description: '扫描云资源安全风险，检测公开暴露、未加密存储、弱安全组、闲置资源等问题。返回风险列表和修复建议。',
  inputSchema: {
    type: 'object',
    properties: {
      severity: { type: 'string', description: '过滤严重度: critical | warning | all' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'security_scan' },
  sortKey: '20',
  dangerLevel: 'safe',
};

const capacityAnalyzeDesc: ToolDescriptor = {
  name: 'capacity_analyze',
  description: '分析资源容量瓶颈，预测哪些实例即将超载，给出扩容建议（升配/扩容）和预计时间。',
  inputSchema: {
    type: 'object',
    properties: {
      metric: { type: 'string', description: 'cpu_utilization | memory_utilization | disk_utilization | all' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'capacity_analyze' },
  sortKey: '21',
  dangerLevel: 'safe',
};

toolRegistry.register(securityScanDesc, async (args, ctx) => {
  // 先获取汇总
  const summaryRes = await fetch(
    `${ctx.monitorServiceUrl}/monitor/security/summary`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  const summary = await summaryRes.json() as {
    critical: number;
    warning: number;
    total: number;
    byRule: Record<string, number>;
    lastScannedAt: string | null;
  };

  let response = `安全扫描结果：${summary.critical} 个严重问题，${summary.warning} 个警告（共 ${summary.total} 条）\n`;
  
  if (summary.lastScannedAt) {
    response += `最近扫描时间：${new Date(summary.lastScannedAt).toLocaleString('zh-CN')}\n`;
  }
  
  response += `\n按规则分布：\n`;
  for (const [rule, count] of Object.entries(summary.byRule)) {
    response += `  - ${rule}: ${count} 条\n`;
  }

  // 如果有发现，获取详情
  if (summary.total > 0) {
    const findingsRes = await fetch(
      `${ctx.monitorServiceUrl}/monitor/security/findings`,
      { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
    );
    const findings = await findingsRes.json() as Array<{
      symptom: string;
      instanceProvider: string;
      rootCause: string;
      outcome: string;
    }>;

    // 按 severity 过滤
    const filtered = args.severity && args.severity !== 'all'
      ? findings.filter((f) => f.outcome === args.severity)
      : findings;

    response += `\n详细列表：\n`;
    for (const f of filtered.slice(0, 10)) {
      response += `  [${f.outcome}] ${f.symptom} (${f.instanceProvider})\n`;
      response += `    建议：${f.rootCause}\n`;
    }

    if (summary.critical > 0) {
      response += `\n建议：对 critical 问题立即处理，可通过 remediation 流程自动修复。`;
    }
  } else {
    response += `\n暂无安全风险发现。`;
  }

  return response;
});

toolRegistry.register(capacityAnalyzeDesc, async (_args, ctx) => {
  const summaryRes = await fetch(
    `${ctx.monitorServiceUrl}/monitor/capacity/summary`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  const summary = await summaryRes.json() as {
    urgent: number;
    recommend: number;
    total: number;
    urgentPredictions: number;
    predictions: Array<{
      instanceId: string;
      metricName: string;
      currentValue: string;
      predictedValue: string;
      hoursToThreshold: string;
      confidence: string;
    }>;
  };

  let response = `容量分析结果：${summary.urgent} 个紧急，${summary.recommend} 个建议\n`;
  response += `72h 内即将超阈值的预测：${summary.urgentPredictions} 条\n`;

  if (summary.urgentPredictions > 0) {
    response += `\n紧急预测：\n`;
    for (const p of summary.predictions) {
      const metricLabel = p.metricName === 'memory_utilization' ? '内存'
        : p.metricName === 'cpu_utilization' ? 'CPU'
        : '磁盘';
      response += `  - 实例 ${p.instanceId}: ${metricLabel} 当前 ${p.currentValue}%，预计 ${Math.round(parseFloat(p.hoursToThreshold))}h 后达到 ${p.predictedValue}%\n`;
      response += `    置信度 ${p.confidence}%\n`;
    }
  }

  // 获取扩容建议详情
  if (summary.total > 0) {
    const recsRes = await fetch(
      `${ctx.monitorServiceUrl}/monitor/capacity/recommendations`,
      { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
    );
    const recs = await recsRes.json() as Array<{
      symptom: string;
      rootCause: string;
      outcome: string;
    }>;

    response += `\n扩容建议：\n`;
    for (const r of recs.slice(0, 10)) {
      response += `  [${r.outcome}] ${r.symptom}\n`;
      response += `    方案：${r.rootCause}\n`;
    }
  } else {
    response += `\n暂无容量风险。`;
  }

  return response;
});
```

- [ ] **Step 2: 在 ai-agent 入口注册工具**

检查 `ai-agent/src/tools/descriptors/` 下是否有 index.ts 自动导入所有工具。如果有，添加 `import './security-tools.js';`。

如果没有 index.ts，查看 `ai-agent/src/index.ts` 或 `ai-agent/src/tools/index.ts`，在现有 `import './descriptors/cloud-tools.js'` 和 `import './descriptors/monitor-tools.js'` 后添加：

```typescript
import './descriptors/security-tools.js';
```

- [ ] **Step 3: 验证编译**

Run: `cd ai-agent && npx tsc --noEmit`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add ai-agent/src/tools/descriptors/security-tools.ts
git commit -m "feat: add security_scan and capacity_analyze agent tools"
```

---

## Task 8: Demo 数据 - 安全 + 容量

**Files:**
- Modify: `scripts/demo-data.sql`

- [ ] **Step 1: 在 demo-data.sql 末尾（COMMIT 前）添加安全 + 容量数据**

在 `scripts/demo-data.sql` 的最后一个 INSERT 之后、`COMMIT;` 之前添加：

```sql

-- ========== 安全扫描规则（alert_rules 表）==========
INSERT INTO demo.alert_rules (id, name, metric, condition, duration, severity, actions, enabled, created_at) VALUES
('d5e6f7a8-0001-4000-8000-000000000001', 'security.public_exposure', 'security', 'auto', '0m', 'critical', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('d5e6f7a8-0001-4000-8000-000000000002', 'security.unencrypted_disk', 'security', 'auto', '0m', 'critical', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('d5e6f7a8-0001-4000-8000-000000000003', 'security.idle_resource', 'security', 'auto', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('d5e6f7a8-0001-4000-8000-000000000004', 'security.weak_security_group', 'security', 'auto', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day'),
('d5e6f7a8-0001-4000-8000-000000000005', 'security.unencrypted_storage', 'security', 'auto', '0m', 'warning', '{"notify":["webhook"]}'::jsonb, true, NOW() - INTERVAL '30 day')
ON CONFLICT (id) DO NOTHING;

-- ========== 安全发现 → alerts（critical 类）==========
INSERT INTO demo.alerts (id, rule_id, instance_id, severity, message, status, fired_at) VALUES
('e6f7a8b9-0001-4000-8000-000000000001', 'd5e6f7a8-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'critical', 'web-prod-01 公网 IP 54.221.10.5 暴露，建议绑定 WAF 或限制访问', 'firing', NOW() - INTERVAL '2 hour'),
('e6f7a8b9-0001-4000-8000-000000000002', 'd5e6f7a8-0001-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000007', 'critical', 'ml-training-gpu 磁盘未加密，存在数据泄露风险', 'firing', NOW() - INTERVAL '2 hour')
ON CONFLICT (id) DO NOTHING;

-- ========== 安全发现 → knowledge_base（全部，metricName='security'）==========
INSERT INTO demo.knowledge_base (id, alert_id, symptom, metric_name, instance_provider, root_cause, action_taken, outcome, created_at) VALUES
('f7a8b9c0-0001-4000-8000-000000000001', 'e6f7a8b9-0001-4000-8000-000000000001', 'web-prod-01 公网 IP 54.221.10.5 暴露', 'security', 'aws', '建议绑定安全组仅放行 443 端口，或配置 WAF', 'pending', 'critical', NOW() - INTERVAL '2 hour'),
('f7a8b9c0-0001-4000-8000-000000000002', 'e6f7a8b9-0001-4000-8000-000000000002', 'ml-training-gpu 磁盘未加密', 'security', 'azure', '建议启用 Azure Disk Encryption 或平台级加密', 'pending', 'critical', NOW() - INTERVAL '2 hour'),
('f7a8b9c0-0001-4000-8000-000000000003', NULL, 'api-worker-02 闲置 7 天', 'security', 'aws', '建议关机或降配以节省成本', 'pending', 'warning', NOW() - INTERVAL '3 hour'),
('f7a8b9c0-0001-4000-8000-000000000004', NULL, 'nginx-gateway 安全组开放 0.0.0.0/0:22', 'security', 'aliyun', '建议限制 SSH 访问源为运维 VPN 段', 'pending', 'warning', NOW() - INTERVAL '3 hour'),
('f7a8b9c0-0001-4000-8000-000000000005', NULL, 'redis-cache 对象存储未启用 SSE', 'security', 'aliyun', '建议启用服务端加密 SSE-KMS', 'pending', 'warning', NOW() - INTERVAL '3 hour')
ON CONFLICT (id) DO NOTHING;

-- ========== 容量建议 → knowledge_base（metricName='capacity'）==========
INSERT INTO demo.knowledge_base (id, symptom, metric_name, instance_provider, root_cause, action_taken, outcome, created_at) VALUES
('f7a8b9c0-0002-4000-8000-000000000001', 'analytics-worker 内存预计 48h 超 90%', 'capacity', 'aliyun', '16C32G → 16C64G，月增 $105', 'pending', 'urgent', NOW() - INTERVAL '1 hour'),
('f7a8b9c0-0002-4000-8000-000000000002', 'web-prod-01 磁盘预计 120h 超阈值', 'capacity', 'aws', '磁盘扩容 50%', 'pending', 'recommend', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ========== 容量预测 → metric_predictions（补充 hoursToThreshold<72 的紧急记录）==========
INSERT INTO demo.metric_predictions (instance_id, metric_name, current_value, predicted_value, threshold, hours_to_threshold, slope, confidence) VALUES
('a1b2c3d4-0001-4000-8000-000000000006', 'memory_utilization', 85.2, 92.5, 90, 48, 0.15, 85.00)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/demo-data.sql
git commit -m "feat: add security and capacity demo data"
```

---

## Task 9: 前端 API 客户端 - security.ts 和 capacity.ts

**Files:**
- Create: `web-console/src/api/security.ts`
- Create: `web-console/src/api/capacity.ts`

- [ ] **Step 1: 创建 security.ts**

创建文件 `web-console/src/api/security.ts`：

```typescript
// web-console/src/api/security.ts
import { api } from './client';

export interface SecurityFinding {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface SecuritySummary {
  critical: number;
  warning: number;
  total: number;
  byRule: Record<string, number>;
  lastScannedAt: string | null;
}

export const securityApi = {
  getFindings: () => api.get<SecurityFinding[]>('/monitor/security/findings'),
  getSummary: () => api.get<SecuritySummary>('/monitor/security/summary'),
  triggerScan: () => api.post<{ status: string; message: string }>('/monitor/security/scan', {}),
};
```

- [ ] **Step 2: 创建 capacity.ts**

创建文件 `web-console/src/api/capacity.ts`：

```typescript
// web-console/src/api/capacity.ts
import { api } from './client';

export interface CapacityRecommendation {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  rootCause: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface CapacitySummary {
  urgent: number;
  recommend: number;
  total: number;
  urgentPredictions: number;
  predictions: Array<{
    instanceId: string;
    metricName: string;
    currentValue: string;
    predictedValue: string;
    hoursToThreshold: string;
    confidence: string;
  }>;
}

export const capacityApi = {
  getRecommendations: () => api.get<CapacityRecommendation[]>('/monitor/capacity/recommendations'),
  getSummary: () => api.get<CapacitySummary>('/monitor/capacity/summary'),
};
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/api/security.ts web-console/src/api/capacity.ts
git commit -m "feat: add security and capacity API clients"
```

---

## Task 10: 前端 Hooks - useSecurity 和 useCapacity

**Files:**
- Create: `web-console/src/hooks/useSecurity.ts`
- Create: `web-console/src/hooks/useCapacity.ts`

- [ ] **Step 1: 创建 useSecurity.ts**

创建文件 `web-console/src/hooks/useSecurity.ts`：

```typescript
// web-console/src/hooks/useSecurity.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { securityApi } from '@/api/security';

export function useSecurityFindings() {
  return useQuery({
    queryKey: ['security-findings'],
    queryFn: () => securityApi.getFindings(),
  });
}

export function useSecuritySummary() {
  return useQuery({
    queryKey: ['security-summary'],
    queryFn: () => securityApi.getSummary(),
    refetchInterval: 30000, // 30s 刷新
  });
}

export function useTriggerSecurityScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => securityApi.triggerScan(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] });
      qc.invalidateQueries({ queryKey: ['security-summary'] });
    },
  });
}
```

- [ ] **Step 2: 创建 useCapacity.ts**

创建文件 `web-console/src/hooks/useCapacity.ts`：

```typescript
// web-console/src/hooks/useCapacity.ts
import { useQuery } from '@tanstack/react-query';
import { capacityApi } from '@/api/capacity';

export function useCapacityRecommendations() {
  return useQuery({
    queryKey: ['capacity-recommendations'],
    queryFn: () => capacityApi.getRecommendations(),
  });
}

export function useCapacitySummary() {
  return useQuery({
    queryKey: ['capacity-summary'],
    queryFn: () => capacityApi.getSummary(),
    refetchInterval: 30000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/hooks/useSecurity.ts web-console/src/hooks/useCapacity.ts
git commit -m "feat: add useSecurity and useCapacity hooks"
```

---

## Task 11: Dashboard 卡片 - SecurityCard 和 CapacityCard

**Files:**
- Create: `web-console/src/components/dashboard/SecurityCard.tsx`
- Create: `web-console/src/components/dashboard/CapacityCard.tsx`

- [ ] **Step 1: 创建 SecurityCard.tsx**

创建文件 `web-console/src/components/dashboard/SecurityCard.tsx`：

```tsx
// web-console/src/components/dashboard/SecurityCard.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecuritySummary, useSecurityFindings } from '@/hooks/useSecurity';
import { Shield, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

export default function SecurityCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: summary, isLoading } = useSecuritySummary();
  const { data: findings } = useSecurityFindings();

  const criticalFindings = (findings || []).filter((f) => f.outcome === 'critical').slice(0, 3);
  const warningFindings = (findings || []).filter((f) => f.outcome === 'warning').slice(0, 2);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor?tab=security')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('security.title')}</CardTitle>
          <Shield className="h-4 w-4 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : summary && summary.total > 0 ? (
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <span className="text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.critical} {t('security.critical')}
              </span>
              <span className="text-yellow-600 font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {summary.warning} {t('security.warning')}
              </span>
            </div>
            {criticalFindings.length > 0 && (
              <div className="space-y-1">
                {criticalFindings.map((f) => (
                  <div key={f.id} className="text-xs text-muted-foreground truncate">
                    • {f.symptom}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-green-600 flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {t('security.noRisk')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 创建 CapacityCard.tsx**

创建文件 `web-console/src/components/dashboard/CapacityCard.tsx`：

```tsx
// web-console/src/components/dashboard/CapacityCard.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCapacitySummary, useCapacityRecommendations } from '@/hooks/useCapacity';
import { TrendingUp, Loader2, AlertTriangle } from 'lucide-react';

export default function CapacityCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: summary, isLoading } = useCapacitySummary();
  const { data: recs } = useCapacityRecommendations();

  const urgentRecs = (recs || []).filter((r) => r.outcome === 'urgent').slice(0, 3);
  const recommendRecs = (recs || []).filter((r) => r.outcome === 'recommend').slice(0, 2);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor?tab=security')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('capacity.title')}</CardTitle>
          <TrendingUp className="h-4 w-4 text-purple-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : summary && summary.total > 0 ? (
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <span className="text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.urgent} {t('capacity.urgent')}
              </span>
              <span className="text-yellow-600 font-medium">
                {summary.recommend} {t('capacity.recommend')}
              </span>
            </div>
            {urgentRecs.length > 0 && (
              <div className="space-y-1">
                {urgentRecs.map((r) => (
                  <div key={r.id} className="text-xs text-muted-foreground truncate">
                    • {r.symptom}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {t('capacity.noRisk')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/dashboard/SecurityCard.tsx web-console/src/components/dashboard/CapacityCard.tsx
git commit -m "feat: add SecurityCard and CapacityCard dashboard components"
```

---

## Task 12: Monitor 页 Security Tab

**Files:**
- Create: `web-console/src/components/monitor/SecurityTab.tsx`
- Modify: `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: 创建 SecurityTab.tsx**

创建文件 `web-console/src/components/monitor/SecurityTab.tsx`：

```tsx
// web-console/src/components/monitor/SecurityTab.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useSecurityFindings, useTriggerSecurityScan } from '@/hooks/useSecurity';
import { Shield, RefreshCw, Loader2 } from 'lucide-react';

export default function SecurityTab() {
  const { t } = useTranslation();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const { data: findings, isLoading } = useSecurityFindings();
  const scanMutation = useTriggerSecurityScan();

  const filtered = (findings || []).filter(
    (f) => severityFilter === 'all' || f.outcome === severityFilter
  );

  const handleScan = async () => {
    try {
      await scanMutation.mutateAsync();
      toast.success(t('security.scanTriggered'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-40"
          >
            <option value="all">{t('security.all')}</option>
            <option value="critical">{t('security.critical')}</option>
            <option value="warning">{t('security.warning')}</option>
          </Select>
        </div>
        <Button onClick={handleScan} disabled={scanMutation.isPending} variant="outline" size="sm">
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('security.rescan')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('security.noFindings')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('security.resource')}</TableHead>
                  <TableHead>{t('security.provider')}</TableHead>
                  <TableHead>{t('security.severity')}</TableHead>
                  <TableHead>{t('security.recommendation')}</TableHead>
                  <TableHead>{t('security.foundAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.symptom}</TableCell>
                    <TableCell>{f.instanceProvider || '-'}</TableCell>
                    <TableCell>
                      <span className={
                        f.outcome === 'critical'
                          ? 'text-red-600 font-medium'
                          : 'text-yellow-600'
                      }>
                        {f.outcome === 'critical' ? t('security.critical') : t('security.warning')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.rootCause}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(f.createdAt).toLocaleString('zh-CN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 修改 Monitor.tsx 添加 Security Tab**

在 `web-console/src/pages/Monitor.tsx` 中：

1) 在文件顶部添加 import：

```typescript
import SecurityTab from '@/components/monitor/SecurityTab';
```

2) 将 `type Tab` 改为：

```typescript
type Tab = 'rules' | 'events' | 'channels' | 'security';
```

3) 在 Tab 按钮数组中添加（`channels` 后）：

```typescript
            { key: 'security' as const, label: t('security.title') },
```

4) 在条件渲染区域添加：

```typescript
      {tab === 'security' && <SecurityTab />}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/monitor/SecurityTab.tsx web-console/src/pages/Monitor.tsx
git commit -m "feat: add Security tab to Monitor page"
```

---

## Task 13: Dashboard 页挂载新卡片

**Files:**
- Modify: `web-console/src/pages/Dashboard.tsx`

- [ ] **Step 1: 在 Dashboard.tsx 挂载 SecurityCard 和 CapacityCard**

在 `web-console/src/pages/Dashboard.tsx` 中：

1) 添加 import（在现有 RemediationCard import 后）：

```typescript
import SecurityCard from '@/components/dashboard/SecurityCard';
import CapacityCard from '@/components/dashboard/CapacityCard';
```

2) 在 PredictionCard 和 RemediationCard 所在的卡片网格区域（通常是一个 `<div className="grid gap-4 md:grid-cols-2">` 容器内），添加：

```tsx
        <SecurityCard />
        <CapacityCard />
```

放在 PredictionCard 和 RemediationCard 后面，保持网格布局。

- [ ] **Step 2: Commit**

```bash
git add web-console/src/pages/Dashboard.tsx
git commit -m "feat: mount SecurityCard and CapacityCard on Dashboard"
```

---

## Task 14: i18n 键值

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: 在 zh.json 添加中文键值**

在 `web-console/src/i18n/locales/zh.json` 的根对象中添加（与其他顶级 key 平级）：

```json
  "security": {
    "title": "安全风险",
    "critical": "严重",
    "warning": "警告",
    "all": "全部",
    "noRisk": "暂无安全风险",
    "noFindings": "暂无安全发现",
    "rescan": "重新扫描",
    "scanTriggered": "安全扫描已触发",
    "resource": "资源",
    "provider": "云厂商",
    "severity": "严重度",
    "recommendation": "修复建议",
    "foundAt": "发现时间"
  },
  "capacity": {
    "title": "容量规划",
    "urgent": "紧急",
    "recommend": "建议",
    "noRisk": "暂无容量风险"
  }
```

- [ ] **Step 2: 在 en.json 添加英文键值**

在 `web-console/src/i18n/locales/en.json` 的根对象中添加：

```json
  "security": {
    "title": "Security",
    "critical": "Critical",
    "warning": "Warning",
    "all": "All",
    "noRisk": "No security risks",
    "noFindings": "No findings",
    "rescan": "Rescan",
    "scanTriggered": "Security scan triggered",
    "resource": "Resource",
    "provider": "Provider",
    "severity": "Severity",
    "recommendation": "Recommendation",
    "foundAt": "Found At"
  },
  "capacity": {
    "title": "Capacity",
    "urgent": "Urgent",
    "recommend": "Recommend",
    "noRisk": "No capacity risks"
  }
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: add security and capacity i18n keys"
```

---

## Task 15: 端到端验证

**Files:**
- 无文件修改

- [ ] **Step 1: 构建并启动 Docker**

Run: `docker compose up -d --build app`
Expected: 构建成功，容器启动

- [ ] **Step 2: 验证 demo 数据已 seed**

Run: `docker compose exec -T postgres psql -U multicloud -d multicloud -c "SELECT COUNT(*) FROM demo.knowledge_base WHERE metric_name='security';"`
Expected: 返回 5

Run: `docker compose exec -T postgres psql -U multicloud -d multicloud -c "SELECT COUNT(*) FROM demo.knowledge_base WHERE metric_name='capacity';"`
Expected: 返回 2

- [ ] **Step 3: 验证 demo 模式 API**

Run: `curl -s -H "X-Demo-Mode: true" http://localhost:80/api/monitor/security/summary | python3 -m json.tool`
Expected: 返回 `{ "critical": 2, "warning": 3, "total": 5, ... }`

Run: `curl -s -H "X-Demo-Mode: true" http://localhost:80/api/monitor/capacity/summary | python3 -m json.tool`
Expected: 返回 `{ "urgent": 1, "recommend": 1, "total": 2, ... }`

- [ ] **Step 4: 验证真实模式 API**

Run: `TOKEN=$(curl -s -X POST http://localhost:80/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])") && curl -s -H "Authorization: Bearer $TOKEN" http://localhost:80/api/monitor/security/summary`
Expected: 返回真实数据（可能为 0，取决于真实 cloud_resources）

- [ ] **Step 5: 验证数据隔离**

Run: `docker compose exec -T postgres psql -U multicloud -d multicloud -c "SELECT 'demo' AS schema, COUNT(*) FROM demo.knowledge_base WHERE metric_name='security' UNION ALL SELECT 'public', COUNT(*) FROM public.knowledge_base WHERE metric_name='security';"`
Expected: demo 有 5 条，public 有 0 或少量（取决于 scanner 是否已跑）

- [ ] **Step 6: 验证前端页面**

打开浏览器访问 `http://localhost`，登录后：
- Dashboard 页应显示安全风险卡片和容量规划卡片
- Monitor 页应有 Security Tab，点击后显示安全发现列表

- [ ] **Step 7: 验证 Agent 工具（如有 LLM_API_KEY）**

在 AI 对话中输入"检查安全风险"，Agent 应调用 security_scan 工具返回结果。

- [ ] **Step 8: Commit 验证通过的最终状态（如有修复）**

```bash
git add -A
git commit -m "chore: e2e verification complete"
```

---

## Self-Review 结果

**1. Spec coverage:**
- ✅ Section 1（安全扫描规则）→ Task 1
- ✅ Section 2（容量规划扩展）→ Task 5
- ✅ Section 3（API 端点 + Agent 工具）→ Task 3, 4, 7
- ✅ Section 4（前端 Dashboard）→ Task 9-13
- ✅ Section 5（Demo 数据 + Remediation）→ Task 6, 8
- ✅ Section 6（调度 + 错误处理）→ Task 1（内含）、Task 2

**2. Placeholder scan:** 无 TBD/TODO，所有步骤含完整代码。

**3. Type一致性:**
- `SecurityFinding` 接口在 Task 1 定义，Task 7 未直接使用（走 API JSON）
- `SecuritySummary` / `CapacitySummary` 在 Task 9 定义，Task 11 使用一致
- `ruleId` 字段名在 Task 1（SecurityFinding）和 Task 6（remediation）一致
