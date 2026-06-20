import { db } from "../db/index.js";
import { cloudResources } from "../db/schema.js";
import { eq, and, like, desc, sql } from "drizzle-orm";
import type { CloudResource, ResourceType } from "../providers/types.js";

export interface ResourceFilters {
  provider?: string;
  resourceType?: ResourceType;
  region?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ResourceListResult {
  items: CloudResource[];
  total: number;
}

export class ResourceService {
  async list(filters: ResourceFilters = {}): Promise<ResourceListResult> {
    const conditions = [];
    if (filters.provider) conditions.push(eq(cloudResources.provider, filters.provider));
    if (filters.resourceType) conditions.push(eq(cloudResources.resourceType, filters.resourceType));
    if (filters.region) conditions.push(eq(cloudResources.region, filters.region));
    if (filters.status) conditions.push(eq(cloudResources.status, filters.status));
    if (filters.search) {
      conditions.push(like(cloudResources.name, `%${filters.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const items = await db
      .select()
      .from(cloudResources)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(cloudResources.createdAt));

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cloudResources)
      .where(where);

    return {
      items: items as unknown as CloudResource[],
      total: countResult[0]?.count || 0,
    };
  }

  async getById(id: string): Promise<CloudResource> {
    const result = await db
      .select()
      .from(cloudResources)
      .where(eq(cloudResources.id, id))
      .limit(1);
    if (result.length === 0) {
      throw new Error(`Resource ${id} not found`);
    }
    return result[0] as unknown as CloudResource;
  }

  async upsertResource(resource: CloudResource): Promise<void> {
    const existing = await db
      .select()
      .from(cloudResources)
      .where(
        and(
          eq(cloudResources.provider, resource.provider),
          eq(cloudResources.resourceType, resource.resourceType),
          eq(cloudResources.providerResourceId, resource.providerResourceId)
        )
      )
      .limit(1);

    const row = {
      provider: resource.provider,
      resourceType: resource.resourceType,
      providerResourceId: resource.providerResourceId,
      name: resource.name,
      region: resource.region,
      status: resource.status,
      attributes: resource.attributes,
      tags: resource.tags,
      lastSyncedAt: new Date(),
      cloudAccountId: resource.cloudAccountId,
    };

    if (existing.length > 0) {
      await db
        .update(cloudResources)
        .set(row)
        .where(eq(cloudResources.id, existing[0].id));
    } else {
      await db.insert(cloudResources).values(row);
    }
  }

  async delete(id: string): Promise<void> {
    await db.delete(cloudResources).where(eq(cloudResources.id, id));
  }

  /** 按资源类型统计数量 */
  async statsByType(): Promise<Array<{ resourceType: string; provider: string; count: number }>> {
    const result = await db
      .select({
        resourceType: cloudResources.resourceType,
        provider: cloudResources.provider,
        count: sql<number>`count(*)::int`,
      })
      .from(cloudResources)
      .groupBy(cloudResources.resourceType, cloudResources.provider);
    return result;
  }

  /** 按状态统计 */
  async statsByStatus(): Promise<Array<{ status: string; count: number }>> {
    const result = await db
      .select({
        status: cloudResources.status,
        count: sql<number>`count(*)::int`,
      })
      .from(cloudResources)
      .groupBy(cloudResources.status);
    return result;
  }
}

export const resourceService = new ResourceService();
