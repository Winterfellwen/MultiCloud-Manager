import { db } from "../db/index.js";
import { eq, and, like, sql } from "drizzle-orm";
import { getProvider, listProviders } from "../providers/registry.js";
import { NotFoundError, ValidationError, scopedDb, type RequestScope } from "@cloudops/shared";
import type { Instance, CreateInstanceOpts, ListOptions } from "../providers/types.js";

export interface InstanceFilters {
  provider?: string;
  region?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface InstanceRow {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string | null;
  region: string;
  status: string;
  cpu: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: string | null;
  tags: Record<string, string> | null;
  lastSyncedAt: Date | null;
  createdAt: Date | null;
  cloudAccountId: string | null;
}

export class InstanceService {
  /**
   * 从本地缓存查询实例列表（UI 查询走缓存，不直接调云 api）
   */
  async list(scope: RequestScope, filters: InstanceFilters = {}): Promise<InstanceRow[]> {
    const t = scopedDb(scope);
    const conditions = [];
    if (filters.provider) conditions.push(eq(t.instances.provider, filters.provider));
    if (filters.region) conditions.push(eq(t.instances.region, filters.region));
    if (filters.status) conditions.push(eq(t.instances.status, filters.status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const rows = await db
      .select()
      .from(t.instances)
      .where(where)
      .orderBy(sql`${t.instances.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
    return rows.map((r) => ({ ...r, tags: r.tags as Record<string, string> | null })) as InstanceRow[];
  }

  /**
   * 从本地缓存查询单个实例
   */
  async getById(scope: RequestScope, id: string): Promise<InstanceRow> {
    const t = scopedDb(scope);
    const result = await db.select().from(t.instances).where(eq(t.instances.id, id)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError("Instance", id);
    }
    return { ...result[0], tags: result[0].tags as Record<string, string> | null } as InstanceRow;
  }

  /**
   * 创建实例（直接调云 API，然后写入缓存）
   */
  async create(scope: RequestScope, opts: CreateInstanceOpts): Promise<Instance> {
    if (!listProviders().includes(opts.provider)) {
      throw new ValidationError(`Provider "${opts.provider}" is not registered`);
    }
    const provider = getProvider(opts.provider);
    const instance = await provider.createInstance(opts);

    await this.upsertInstance(scope, instance);
    return instance;
  }

  async start(scope: RequestScope, id: string): Promise<void> {
    const row = await this.getById(scope, id);
    const provider = getProvider(row.provider);
    await provider.startInstance(row.providerInstanceId);
    const t = scopedDb(scope);
    await db
      .update(t.instances)
      .set({ status: "running", lastSyncedAt: new Date() })
      .where(eq(t.instances.id, id));
  }

  async stop(scope: RequestScope, id: string): Promise<void> {
    const row = await this.getById(scope, id);
    const provider = getProvider(row.provider);
    await provider.stopInstance(row.providerInstanceId);
    const t = scopedDb(scope);
    await db
      .update(t.instances)
      .set({ status: "stopped", lastSyncedAt: new Date() })
      .where(eq(t.instances.id, id));
  }

  async reboot(scope: RequestScope, id: string): Promise<void> {
    const row = await this.getById(scope, id);
    const provider = getProvider(row.provider);
    await provider.rebootInstance(row.providerInstanceId);
    const t = scopedDb(scope);
    await db
      .update(t.instances)
      .set({ status: "running", lastSyncedAt: new Date() })
      .where(eq(t.instances.id, id));
  }

  async delete(scope: RequestScope, id: string): Promise<void> {
    const row = await this.getById(scope, id);
    const provider = getProvider(row.provider);
    await provider.deleteInstance(row.providerInstanceId);
    const t = scopedDb(scope);
    await db.delete(t.instances).where(eq(t.instances.id, id));
  }

  /**
   * 写入或更新缓存中的实例记录
   */
  async upsertInstance(scope: RequestScope, instance: Instance): Promise<void> {
    const t = scopedDb(scope);
    const existing = await db
      .select()
      .from(t.instances)
      .where(
        and(
          eq(t.instances.provider, instance.provider),
          eq(t.instances.providerInstanceId, instance.providerInstanceId)
        )
      )
      .limit(1);

    const row = {
      provider: instance.provider,
      providerInstanceId: instance.providerInstanceId,
      name: instance.name,
      region: instance.region,
      status: instance.status,
      cpu: instance.spec.cpu,
      memoryMb: instance.spec.memoryMb,
      diskGb: instance.spec.diskGb,
      publicIp: instance.publicIp,
      privateIp: instance.privateIp,
      monthlyCost: instance.monthlyCost.toString(),
      tags: instance.tags,
      lastSyncedAt: instance.lastSyncedAt,
    };

    if (existing.length > 0) {
      await db
        .update(t.instances)
        .set(row)
        .where(eq(t.instances.id, existing[0].id));
    } else {
      await db.insert(t.instances).values(row);
    }
  }
}

export const instanceService = new InstanceService();
