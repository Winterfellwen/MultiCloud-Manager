import { db } from "../db/index.js";
import { instances } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { listProviders, getProvider } from "../providers/registry.js";
import { instanceService } from "./instance.service.js";
import type { Instance } from "../providers/types.js";

export interface SyncResult {
  provider: string;
  synced: number;
  errors: string[];
}

export class SyncService {
  /**
   * 同步所有已注册 Provider 的实例到本地缓存
   */
  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const providerName of listProviders()) {
      results.push(await this.syncProvider(providerName));
    }
    return results;
  }

  /**
   * 同步单个 Provider 的实例
   */
  async syncProvider(providerName: string): Promise<SyncResult> {
    const result: SyncResult = { provider: providerName, synced: 0, errors: [] };

    try {
      const provider = getProvider(providerName);
      const remoteInstances: Instance[] = await provider.listInstances();

      for (const instance of remoteInstances) {
        try {
          await instanceService.upsertInstance(instance);
          result.synced++;
        } catch (err) {
          result.errors.push(
            `Failed to sync ${instance.providerInstanceId}: ${(err as Error).message}`
          );
        }
      }

      // 标记远端已不存在的实例为 terminated
      await this.markTerminated(providerName, remoteInstances.map((i) => i.providerInstanceId));
    } catch (err) {
      result.errors.push(`Provider sync failed: ${(err as Error).message}`);
    }

    return result;
  }

  /**
   * 远端已不存在的本地缓存实例标记为 terminated
   */
  private async markTerminated(providerName: string, remoteIds: string[]): Promise<void> {
    const localRows = await db
      .select()
      .from(instances)
      .where(eq(instances.provider, providerName));

    const remoteSet = new Set(remoteIds);
    for (const row of localRows) {
      if (!remoteSet.has(row.providerInstanceId) && row.status !== "terminated") {
        await db
          .update(instances)
          .set({ status: "terminated", lastSyncedAt: new Date() })
          .where(eq(instances.id, row.id));
      }
    }
  }
}

export const syncService = new SyncService();
