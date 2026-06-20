import { db } from "../db/index.js";
import { cloudResources, instances } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
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
   */
  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const providerName of listProviders()) {
      for (const resourceType of ALL_RESOURCE_TYPES) {
        results.push(await this.syncResourceType(providerName, resourceType));
      }
    }
    return results;
  }

  /**
   * 同步指定 Provider 的指定资源类型
   */
  async syncResourceType(providerName: string, resourceType: ResourceType): Promise<SyncResult> {
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
        return await this.syncInstances(providerName);
      }

      // 通用资源同步
      const remoteResources: CloudResource[] = await provider.listResources(resourceType);

      for (const resource of remoteResources) {
        try {
          await resourceService.upsertResource(resource);
          result.synced++;
        } catch (err) {
          result.errors.push(
            `Failed to sync ${resource.providerResourceId}: ${(err as Error).message}`
          );
        }
      }

      // 标记远端已不存在的为 terminated
      await this.markResourceTerminated(providerName, resourceType, remoteResources.map(r => r.providerResourceId));
    } catch (err) {
      result.errors.push(`Provider sync failed: ${(err as Error).message}`);
    }

    return result;
  }

  /**
   * 向后兼容：同步指定 Provider 的实例
   */
  async syncProvider(providerName: string): Promise<SyncResult> {
    return await this.syncInstances(providerName);
  }

  private async syncInstances(providerName: string): Promise<SyncResult> {
    const result: SyncResult = { provider: providerName, resourceType: 'instance', synced: 0, errors: [] };
    try {
      const provider = getProvider(providerName);
      const remoteInstances: Instance[] = await provider.listInstances();

      for (const instance of remoteInstances) {
        try {
          await instanceService.upsertInstance(instance);
          // 同时写入 cloud_resources 表
          await resourceService.upsertResource({
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

      await this.markTerminated(providerName, remoteInstances.map(i => i.providerInstanceId));
    } catch (err) {
      result.errors.push(`Provider sync failed: ${(err as Error).message}`);
    }
    return result;
  }

  private async markTerminated(providerName: string, remoteIds: string[]): Promise<void> {
    const localRows = await db.select().from(instances).where(eq(instances.provider, providerName));
    const remoteSet = new Set(remoteIds);
    for (const row of localRows) {
      if (!remoteSet.has(row.providerInstanceId) && row.status !== 'terminated') {
        await db.update(instances).set({ status: 'terminated', lastSyncedAt: new Date() }).where(eq(instances.id, row.id));
      }
    }
  }

  private async markResourceTerminated(providerName: string, resourceType: ResourceType, remoteIds: string[]): Promise<void> {
    const localRows = await db
      .select()
      .from(cloudResources)
      .where(and(
        eq(cloudResources.provider, providerName),
        eq(cloudResources.resourceType, resourceType)
      ));

    const remoteSet = new Set(remoteIds);
    for (const row of localRows) {
      if (!remoteSet.has(row.providerResourceId) && row.status !== 'terminated') {
        await db
          .update(cloudResources)
          .set({ status: 'terminated', lastSyncedAt: new Date() })
          .where(eq(cloudResources.id, row.id));
      }
    }
  }
}

export const syncService = new SyncService();
