// monitor-service/src/services/security-scanner.ts
import { db } from '../db/index.js';
import { scopedDb, PUBLIC_SCOPE, DEMO_SCOPE, type RequestScope } from '@cloudops/shared';
import { eq, and, gte } from 'drizzle-orm';
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
