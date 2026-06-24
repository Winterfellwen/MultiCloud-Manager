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
    if (filters.region && filters.region !== 'all') conditions.push(eq(cloudResources.region, filters.region));
    if (filters.status && filters.status !== 'all') conditions.push(eq(cloudResources.status, filters.status));
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

  /** 获取拓扑数据 */
  async getTopology(filters: {
    provider?: string;
    region?: string;
    resourceType?: ResourceType;
    status?: string;
    cloudAccountId?: string;
  }): Promise<{
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      provider: string;
      region: string;
      status: string;
      category: string;
      icon: string;
      data: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      label?: string;
    }>;
  }> {
    const resources = await this.list({
      ...filters,
      limit: 1000,
    });

    const nodes: Array<{
      id: string;
      type: string;
      label: string;
      provider: string;
      region: string;
      status: string;
      category: string;
      icon: string;
      data: Record<string, unknown>;
    }> = [];

    const edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      label?: string;
    }> = [];

    // 资源类型到分类和图标的映射
    const typeMeta: Record<string, { category: string; icon: string }> = {
      instance: { category: 'compute', icon: 'server' },
      disk: { category: 'storage', icon: 'hard-drive' },
      bucket: { category: 'storage', icon: 'database' },
      database: { category: 'database', icon: 'database' },
      cache: { category: 'database', icon: 'zap' },
      loadbalancer: { category: 'network', icon: 'share-2' },
      vpc: { category: 'network', icon: 'git-branch' },
      securitygroup: { category: 'security', icon: 'shield' },
      cdn: { category: 'cdn', icon: 'globe' },
      cluster: { category: 'container', icon: 'boxes' },
      aiservice: { category: 'ai', icon: 'cpu' },
    };

    // 创建节点
    for (const resource of resources.items) {
      const meta = typeMeta[resource.resourceType] || { category: 'unknown', icon: 'circle' };
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
      const topology = (resource as any).topology;
      if (!topology) continue;

      // VPC 关系
      if (topology.vpcId) {
        const vpcExists = resources.items.some(r => r.providerResourceId === topology.vpcId);
        if (vpcExists) {
          edges.push({
            id: `edge-${resource.id}-${topology.vpcId}`,
            source: resource.id,
            target: topology.vpcId,
            type: 'contains',
            label: '位于',
          });
        }
      }

      // 安全组关系
      if (topology.securityGroupIds?.length) {
        for (const sgId of topology.securityGroupIds) {
          const sgExists = resources.items.some(r => r.providerResourceId === sgId);
          if (sgExists) {
            edges.push({
              id: `edge-${resource.id}-${sgId}`,
              source: resource.id,
              target: sgId,
              type: 'protected-by',
              label: '受保护',
            });
          }
        }
      }

      // 负载均衡器目标实例关系
      if (topology.targetInstanceIds?.length) {
        for (const instanceId of topology.targetInstanceIds) {
          const instanceExists = resources.items.some(r => r.providerResourceId === instanceId);
          if (instanceExists) {
            edges.push({
              id: `edge-${resource.id}-${instanceId}`,
              source: resource.id,
              target: instanceId,
              type: 'routes-to',
              label: '转发',
            });
          }
        }
      }

      // 磁盘挂载实例关系
      if (resource.resourceType === 'disk' && resource.attributes?.attachedInstanceId) {
        const instanceId = resource.attributes.attachedInstanceId as string;
        const instanceExists = resources.items.some(r => r.providerResourceId === instanceId);
        if (instanceExists) {
          edges.push({
            id: `edge-${resource.id}-${instanceId}`,
            source: resource.id,
            target: instanceId,
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
