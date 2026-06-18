import { db } from "../db/index.js";
import { cloudAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@cloudops/shared";
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

const VALID_PROVIDERS = ["aws", "aliyun", "azure"];

export class AccountService {
  async list(): Promise<AccountRow[]> {
    const rows = await db.select().from(cloudAccounts);
    return rows.map((r) => ({ ...r, config: r.config as Record<string, unknown> })) as AccountRow[];
  }

  async getById(id: string): Promise<AccountRow> {
    const result = await db.select().from(cloudAccounts).where(eq(cloudAccounts.id, id)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError("CloudAccount", id);
    }
    return { ...result[0], config: result[0].config as Record<string, unknown> } as AccountRow;
  }

  /**
   * 添加云账号并动态注册 Provider
   */
  async create(input: {
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }): Promise<AccountRow> {
    if (!VALID_PROVIDERS.includes(input.provider)) {
      throw new ValidationError(`Unsupported provider: ${input.provider}`);
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

    return result[0] as AccountRow;
  }

  async delete(id: string): Promise<void> {
    const result = await db.delete(cloudAccounts).where(eq(cloudAccounts.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError("CloudAccount", id);
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
