import { db } from "../db/index.js";
import { cloudAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@cloudops/shared";
import {
  getSupportedProviderIds,
  getProviderMeta,
  maskConfig,
  type CloudProviderId,
} from "@cloudops/shared";
import { registerProviders, listProviders, hasProvider } from "../providers/registry.js";
import { config } from "../config.js";

interface AccountRow {
  id: string;
  name: string;
  provider: string;
  config: Record<string, unknown>;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 返回给前端的账号（凭证已脱敏） */
interface AccountRowWithHint extends AccountRow {
  /** 凭证脱敏提示（如 AKIA****wX9z），永不返回明文 */
  credentialHint: Record<string, string>;
}

const VALID_PROVIDERS = getSupportedProviderIds();

export class AccountService {
  async list(): Promise<AccountRowWithHint[]> {
    const rows = await db.select().from(cloudAccounts);
    return rows.map((r) => {
      const cfg = r.config as Record<string, unknown>;
      return {
        ...r,
        config: cfg,
        credentialHint: maskConfig(r.provider, cfg),
      };
    }) as AccountRowWithHint[];
  }

  async getById(id: string): Promise<AccountRowWithHint> {
    const result = await db.select().from(cloudAccounts).where(eq(cloudAccounts.id, id)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError("CloudAccount", id);
    }
    const r = result[0];
    const cfg = r.config as Record<string, unknown>;
    return {
      ...r,
      config: cfg,
      credentialHint: maskConfig(r.provider, cfg),
    } as AccountRowWithHint;
  }

  /**
   * 添加云账号并动态注册 Provider
   */
  async create(input: {
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }): Promise<AccountRowWithHint> {
    if (!VALID_PROVIDERS.includes(input.provider as CloudProviderId)) {
      throw new ValidationError(`Unsupported provider: ${input.provider}`);
    }

    // 校验必填字段（参考 MultiCloud-Manager 后端也做字段校验）
    const meta = getProviderMeta(input.provider);
    if (meta) {
      for (const field of meta.fields) {
        if (field.required) {
          const val = input.config[field.key];
          if (!val || (typeof val === 'string' && !val.trim())) {
            throw new ValidationError(`缺少必填字段: ${field.label}`);
          }
        }
      }
    }

    const result = await db
      .insert(cloudAccounts)
      .values({
        name: input.name,
        provider: input.provider,
        config: input.config,
        status: "active",
      })
      .returning();

    // 动态注册 Provider（运行时新增账号）
    this.registerFromAccount(input.provider, input.config);

    const r = result[0];
    const cfg = r.config as Record<string, unknown>;
    return {
      ...r,
      config: cfg,
      credentialHint: maskConfig(r.provider, cfg),
    } as AccountRowWithHint;
  }

  async delete(id: string): Promise<void> {
    const result = await db.delete(cloudAccounts).where(eq(cloudAccounts.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError("CloudAccount", id);
    }
  }

  /**
   * 更新云账号（名称、配置、状态）
   * 参考 MultiCloud-Manager 的凭证部分更新合并：空字段=保留原值
   */
  async update(id: string, input: {
    name?: string;
    config?: Record<string, unknown>;
    status?: string;
  }): Promise<AccountRowWithHint> {
    const existing = await this.getById(id);

    const sets: Partial<typeof cloudAccounts.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) sets.name = input.name;
    if (input.status !== undefined) sets.status = input.status;

    // 凭证部分更新合并：空字段保留原值（避免编辑时要求重新输入所有凭证）
    let mergedConfig: Record<string, unknown> | undefined;
    if (input.config !== undefined) {
      mergedConfig = { ...existing.config };
      for (const [k, v] of Object.entries(input.config)) {
        if (typeof v === 'string' && v.trim() !== '') {
          mergedConfig[k] = v;
        }
        // 空字符串 = 保留原值（不覆盖）
      }
      sets.config = mergedConfig;
    }

    const result = await db
      .update(cloudAccounts)
      .set(sets)
      .where(eq(cloudAccounts.id, id))
      .returning();

    // 如果 config 变了，重新注册 Provider
    if (mergedConfig !== undefined) {
      this.registerFromAccount(existing.provider, mergedConfig);
    }

    const r = result[0];
    const cfg = r.config as Record<string, unknown>;
    return {
      ...r,
      config: cfg,
      credentialHint: maskConfig(r.provider, cfg),
    } as AccountRowWithHint;
  }

  /**
   * 测试云账号连通性（参考 MultiCloud-Manager 的"以同步代测试"思路，但做轻量化）
   * 尝试调用 provider 的 listRegions，成功则凭证有效
   */
  async testConnection(id: string): Promise<{ ok: boolean; message: string; details?: unknown }> {
    const account = await this.getById(id);
    try {
      // 确保 provider 已注册
      if (!hasProvider(account.provider)) {
        this.registerFromAccount(account.provider, account.config);
      }
      // 动态 import 避免循环依赖
      const { getProvider } = await import("../providers/registry.js");
      const provider = getProvider(account.provider);
      // 轻量级连通性检查：列出区域（比 listInstances 快）
      const regions = await provider.listRegions();
      return {
        ok: true,
        message: `连接成功，发现 ${regions.length} 个可用区域`,
        details: { regionCount: regions.length },
      };
    } catch (e) {
      return {
        ok: false,
        message: `连接失败: ${(e as Error).message}`,
      };
    }
  }

  /**
   * 启动时根据环境变量注册已配置的 Provider
   */
  registerFromEnv(): void {
    const providerConfig: Record<string, unknown> = {};

    if (config.aws?.accessKeyId && config.aws?.secretAccessKey) {
      providerConfig.aws = config.aws;
    }
    if (config.aliyun?.accessKeyId && config.aliyun?.accessKeySecret) {
      providerConfig.aliyun = config.aliyun;
    }
    if (
      config.azure?.tenantId &&
      config.azure?.clientId &&
      config.azure?.clientSecret &&
      config.azure?.subscriptionId
    ) {
      providerConfig.azure = config.azure;
    }

    registerProviders(providerConfig as any);
  }

  /**
   * 启动时从数据库加载所有云账户并注册 Provider
   * 服务重启后内存中的 providers Map 会丢失，需要从数据库重新加载
   */
  async registerFromDb(): Promise<void> {
    try {
      const rows = await db.select().from(cloudAccounts);
      for (const row of rows) {
        const cfg = row.config as Record<string, unknown>;
        this.registerFromAccount(row.provider, cfg);
      }
    } catch (err) {
      // 数据库查询失败不阻塞启动（可能表还未创建）
      console.error('Failed to load cloud accounts from DB:', (err as Error).message);
    }
  }

  /**
   * 根据账号配置注册单个 Provider
   */
  private registerFromAccount(provider: string, cfg: Record<string, unknown>): void {
    registerProviders({ [provider]: cfg } as any);
  }

  getRegisteredProviders(): string[] {
    return listProviders();
  }

  isRegistered(name: string): boolean {
    return hasProvider(name);
  }
}

export const accountService = new AccountService();
