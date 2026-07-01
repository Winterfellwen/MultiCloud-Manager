import type { FastifyInstance } from "fastify";
import { recordAudit } from "@cloudops/shared";
import { resourceService } from "../services/resource.service.js";
import { syncService } from "../services/sync.service.js";
import { getProvider } from "../providers/registry.js";
import { RESOURCE_TYPE_META } from "../providers/types.js";
import type { ResourceType } from "../providers/types.js";
import { config } from "../config.js";

function getUserId(request: any): string {
  return (request.headers['x-user-id'] as string) || 'unknown';
}
function getTraceId(request: any): string | undefined {
  return request.headers['x-trace-id'] as string | undefined;
}
function getIp(request: any): string {
  return (request.headers['x-forwarded-for'] as string) || request.ip;
}

export async function resourceRoutes(app: FastifyInstance) {
  // 获取资源类型元数据
  app.get("/types", async () => {
    return RESOURCE_TYPE_META;
  });

  // 列出资源（支持按类型、厂商、区域、状态过滤）
  app.get("/", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return resourceService.list(request.scope, {
      provider: query.provider,
      resourceType: query.resourceType as ResourceType | undefined,
      region: query.region,
      status: query.status,
      search: query.search,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });
  });

  // 资源统计（必须在 /:id 之前注册，否则会被当作 id）
  app.get("/stats/summary", async (request) => {
    const [byType, byStatus] = await Promise.all([
      resourceService.statsByType(request.scope),
      resourceService.statsByStatus(request.scope),
    ]);
    return { byType, byStatus };
  });

  // 获取资源详情
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    return resourceService.getById(request.scope, id);
  });

  // 删除资源
  app.delete("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const resource = await resourceService.getById(request.scope, id);
    const provider = getProvider(resource.provider);
    await provider.deleteResource(resource.resourceType, resource.providerResourceId);
    await resourceService.delete(request.scope, id);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'resource.delete',
      resourceType: resource.resourceType,
      resourceId: id,
      provider: resource.provider,
      result: 'success',
      ip: getIp(request),
      traceId: getTraceId(request),
    });
    return { ok: true, id };
  });

  // 触发资源同步（支持按类型和厂商过滤）
  app.post("/sync", async (request) => {
    const query = request.query as { provider?: string; resourceType?: string };
    if (query.provider && query.resourceType) {
      return [await syncService.syncResourceType(query.provider, query.resourceType as ResourceType, request.scope)];
    }
    if (query.provider) {
      const provider = getProvider(query.provider);
      const types = provider.getSupportedResourceTypes();
      const results = [];
      for (const type of types) {
        results.push(await syncService.syncResourceType(query.provider, type, request.scope));
      }
      return results;
    }
    return syncService.syncAll(request.scope);
  });
}
