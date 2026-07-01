import { db } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { scopedDb, type RequestScope } from "@cloudops/shared";
import { listProviders, getProvider } from "../providers/registry.js";
import { instanceService } from "./instance.service.js";
import { resourceService } from "./resource.service.js";
import type { Instance, CloudResource, ResourceType } from "../providers/types.js";

export interface SyncResult {
  provider: string;
  resourceType?: ResourceType;
  synced: number;
  errors: string[];
}

const ALL_RESOURCE_TYPES: ResourceType[] = [
  'instance', 'disk', 'bucket', 'database', 'cache',
  'loadbalancer', 'vpc', 'securitygroup', 'cdn', 'cluster', 'aiservice'
];

export class SyncService {
  /**
   * 同步所有 Provider 的所有资源类型
   * demo 模式下跳过同步（demo 数据是静态快照）
   */
  async syncAll(scope: RequestScope): Promise<SyncResult[]> {
    if (scope.isDemo) {
      return [{ provider: 'demo', resourceType: 'instance', synced: 0, errors: ['demo mode: sync skipped'] }];
    }
    const results: SyncResult[] = [];
    for (const providerName of listProviders()) {
      for (const resourceType of ALL_RESOURCE_TYPES) {
        results.push(await this.syncResourceType(providerName, resourceType, scope));
      }
    }
    return results;
  }

  /**
   * 同步指定 Provider 的指定资源类型
   */
  async syncResourceType(providerName: string, resourceType: ResourceType, scope: RequestScope): Promise<SyncResult> {
    const result: SyncResult = { provider: providerName, resourceType, synced: 0, errors: [] };

    try {
      const provider = getProvider(providerName);

      // 检查 provider 是否支持该资源类型
      const supportedTypes = provider.getSupportedResourceTypes();
      if (!supportedTypes.includes(resourceType)) {
        return result;
      }

      // instance 类型走原有逻辑（向后兼容，同时写两张表）
      if (resourceType === 'instance') {
        return await this.syncInstances(providerName, scope);
      }

      // 通用资源同步
      const remoteResources: CloudResource[] = await provider.listResources(resourceType);

      for (const resource of remoteResources) {
        try {
          await resourceService.upsertResource(scope, resource);
          result.synced++;
        } catch (err) {
          result.errors.push(
            `Failed to sync ${resource.providerResourceId}: ${(err as Error).message}`
          );
        }
      }

      // 标记远端已不存在的为 terminated
      await this.markResourceTerminated(providerName, resourceType, remoteResources.map(r => r.providerResourceId), scope);
    } catch (err) {
      result.errors.push(`Provider sync failed: ${(err as Error).message}`);
    }

    return result;
  }

  /**
   * 向后兼容：同步指定 Provider 的实例
   */
  async syncProvider(providerName: string, scope: RequestScope): Promise<SyncResult> {
    return await this.syncInstances(providerName, scope);
  }

  private async syncInstances(providerName: string, scope: RequestScope): Promise<SyncResult> {
    const result: SyncResult = { provider: providerName, resourceType: 'instance', synced: 0, errors: [] };
    try {
      const provider = getProvider(providerName);
      const remoteInstances: Instance[] = await provider.listInstances();

      for (const instance of remoteInstances) {
        try {
          await instanceService.upsertInstance(scope, instance);
          // 同时写入 cloud_resources 表
          await resourceService.upsertResource(scope, {
            id: '',
            provider: instance.provider,
            resourceType: 'instance',
            providerResourceId: instance.providerInstanceId,
            name: instance.name,
            region: instance.region,
            status: instance.status,
            attributes: {
              cpu: instance.spec.cpu,
              memoryMb: instance.spec.memoryMb,
              diskGb: instance.spec.diskGb,
              publicIp: instance.publicIp,
              privateIp: instance.privateIp,
              monthlyCost: instance.monthlyCost,
            },
            tags: instance.tags,
            createdAt: instance.createdAt,
          });
          result.synced++;
        } catch (err) {
          result.errors.push(`Failed to sync ${instance.providerInstanceId}: ${(err as Error).message}`);
        }
      }

      await this.markTerminated(providerName, remoteInstances.map(i => i.providerInstanceId), scope);
    } catch (err) {
      result.errors.push(`Provider sync failed: ${(err as Error).message}`);
    }
    return result;
  }

  private async markTerminated(providerName: string, remoteIds: string[], scope: RequestScope): Promise<void> {
    const t = scopedDb(scope);
    const localRows = await db.select().from(t.instances).where(eq(t.instances.provider, providerName));
    const remoteSet = new Set(remoteIds);
    for (const row of localRows) {
      if (!remoteSet.has(row.providerInstanceId) && row.status !== 'terminated') {
        await db.update(t.instances).set({ status: 'terminated', lastSyncedAt: new Date() }).where(eq(t.instances.id, row.id));
      }
    }
  }

  private async markResourceTerminated(providerName: string, resourceType: ResourceType, remoteIds: string[], scope: RequestScope): Promise<void> {
    const t = scopedDb(scope);
    const localRows = await db
      .select()
      .from(t.cloudResources)
      .where(and(
        eq(t.cloudResources.provider, providerName),
        eq(t.cloudResources.resourceType, resourceType)
      ));

    const remoteSet = new Set(remoteIds);
    for (const row of localRows) {
      if (!remoteSet.has(row.providerResourceId) && row.status !== 'terminated') {
        await db
          .update(t.cloudResources)
          .set({ status: 'terminated', lastSyncedAt: new Date() })
          .where(eq(t.cloudResources.id, row.id));
      }
    }
  }
}

export const syncService = new SyncService();
