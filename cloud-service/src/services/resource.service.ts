import { db } from "../db/index.js";
import { eq, and, like, desc, sql } from "drizzle-orm";
import { scopedDb, type RequestScope } from "@cloudops/shared";
import type { CloudResource, ResourceType } from "../providers/types.js";
import { RESOURCE_TYPE_META } from "../providers/types.js";

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

export interface TopologyNode {
  id: string;
  type: string;
  label: string;
  provider: string;
  region: string;
  status: string;
  category: string;
  icon: string;
  data: Record<string, unknown>;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

export class ResourceService {
  async list(scope: RequestScope, filters: ResourceFilters = {}): Promise<ResourceListResult> {
    const t = scopedDb(scope);
    const conditions = [];
    if (filters.provider) conditions.push(eq(t.cloudResources.provider, filters.provider));
    if (filters.resourceType) conditions.push(eq(t.cloudResources.resourceType, filters.resourceType));
    if (filters.region && filters.region !== 'all') conditions.push(eq(t.cloudResources.region, filters.region));
    if (filters.status && filters.status !== 'all') conditions.push(eq(t.cloudResources.status, filters.status));
    if (filters.search) {
      conditions.push(like(t.cloudResources.name, `%${filters.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const items = await db
      .select()
      .from(t.cloudResources)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(t.cloudResources.createdAt));

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.cloudResources)
      .where(where);

    return {
      items: items as unknown as CloudResource[],
      total: countResult[0]?.count || 0,
    };
  }

  async getById(scope: RequestScope, id: string): Promise<CloudResource> {
    const t = scopedDb(scope);
    const result = await db
      .select()
      .from(t.cloudResources)
      .where(eq(t.cloudResources.id, id))
      .limit(1);
    if (result.length === 0) {
      throw new Error(`Resource ${id} not found`);
    }
    return result[0] as unknown as CloudResource;
  }

  async upsertResource(scope: RequestScope, resource: CloudResource): Promise<void> {
    const t = scopedDb(scope);
    const existing = await db
      .select()
      .from(t.cloudResources)
      .where(
        and(
          eq(t.cloudResources.provider, resource.provider),
          eq(t.cloudResources.resourceType, resource.resourceType),
          eq(t.cloudResources.providerResourceId, resource.providerResourceId)
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
        .update(t.cloudResources)
        .set(row)
        .where(eq(t.cloudResources.id, existing[0].id));
    } else {
      await db.insert(t.cloudResources).values(row);
    }
  }

  async delete(scope: RequestScope, id: string): Promise<void> {
    const t = scopedDb(scope);
    await db.delete(t.cloudResources).where(eq(t.cloudResources.id, id));
  }

  /** 按资源类型统计数量 */
  async statsByType(scope: RequestScope): Promise<Array<{ resourceType: string; provider: string; count: number }>> {
    const t = scopedDb(scope);
    const result = await db
      .select({
        resourceType: t.cloudResources.resourceType,
        provider: t.cloudResources.provider,
        count: sql<number>`count(*)::int`,
      })
      .from(t.cloudResources)
      .groupBy(t.cloudResources.resourceType, t.cloudResources.provider);
    return result;
  }

  /** 按状态统计 */
  async statsByStatus(scope: RequestScope): Promise<Array<{ status: string; count: number }>> {
    const t = scopedDb(scope);
    const result = await db
      .select({
        status: t.cloudResources.status,
        count: sql<number>`count(*)::int`,
      })
      .from(t.cloudResources)
      .groupBy(t.cloudResources.status);
    return result;
  }

  /** 获取拓扑数据 */
  async getTopology(scope: RequestScope, filters: {
    provider?: string;
    region?: string;
    resourceType?: ResourceType;
    status?: string;
    /** Note: cloudAccountId is not supported by list() and will be ignored */
    cloudAccountId?: string;
  }): Promise<{ nodes: TopologyNode[]; edges: TopologyEdge[] }> {
    // NOTE: limit 1000 is a tradeoff between completeness and performance.
    // For deployments with >1000 resources, consider paginating or accepting a limit parameter.
    const resources = await this.list(scope, {
      ...filters,
      limit: 1000,
    });

    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];

    // Build providerResourceId → id lookup map for O(1) edge resolution
    const resourceIdByProvider = new Map<string, string>();
    for (const resource of resources.items) {
      resourceIdByProvider.set(resource.providerResourceId, resource.id);
    }

    // Build type metadata lookup from shared RESOURCE_TYPE_META
    const typeMeta = new Map<string, { category: string; icon: string }>();
    for (const meta of RESOURCE_TYPE_META) {
      typeMeta.set(meta.type, { category: meta.category, icon: meta.iconName });
    }

    // 创建节点
    for (const resource of resources.items) {
      const meta = typeMeta.get(resource.resourceType) || { category: 'unknown', icon: 'circle' };
      nodes.push({
        id: resource.id,
        type: resource.resourceType,
        label: resource.name || resource.providerResourceId,
        provider: resource.provider,
        region: resource.region,
        status: resource.status,
        category: meta.category,
        icon: meta.icon,
        data: resource.attributes || {},
      });
    }

    // 创建边（基于 topology 关系字段）
    for (const resource of resources.items) {
      const topology = resource.topology;
      if (!topology) continue;

      // VPC 关系
      if (topology.vpcId) {
        const targetId = resourceIdByProvider.get(topology.vpcId);
        if (targetId) {
          edges.push({
            id: `edge-${resource.id}-${targetId}`,
            source: resource.id,
            target: targetId,
            type: 'contains',
            label: '位于',
          });
        }
      }

      // 安全组关系
      if (topology.securityGroupIds?.length) {
        for (const sgId of topology.securityGroupIds) {
          const targetId = resourceIdByProvider.get(sgId);
          if (targetId) {
            edges.push({
              id: `edge-${resource.id}-${targetId}`,
              source: resource.id,
              target: targetId,
              type: 'protected-by',
              label: '受保护',
            });
          }
        }
      }

      // 负载均衡器目标实例关系
      if (topology.targetInstanceIds?.length) {
        for (const instanceId of topology.targetInstanceIds) {
          const targetId = resourceIdByProvider.get(instanceId);
          if (targetId) {
            edges.push({
              id: `edge-${resource.id}-${targetId}`,
              source: resource.id,
              target: targetId,
              type: 'routes-to',
              label: '转发',
            });
          }
        }
      }

      // 磁盘挂载实例关系
      if (resource.resourceType === 'disk' && resource.attributes?.attachedInstanceId) {
        const instanceId = resource.attributes.attachedInstanceId as string;
        const targetId = resourceIdByProvider.get(instanceId);
        if (targetId) {
          edges.push({
            id: `edge-${resource.id}-${targetId}`,
            source: resource.id,
            target: targetId,
            type: 'attached-to',
            label: '挂载',
          });
        }
      }
    }

    return { nodes, edges };
  }
}

export const resourceService = new ResourceService();
