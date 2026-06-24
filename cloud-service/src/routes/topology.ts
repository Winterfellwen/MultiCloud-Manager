import type { FastifyInstance } from "fastify";
import { resourceService } from "../services/resource.service.js";
import type { ResourceType } from "../providers/types.js";

export async function topologyRoutes(app: FastifyInstance) {
  /**
   * GET /topology
   * 获取拓扑数据
   * Query params:
   *   - provider: 云厂商
   *   - region: 区域
   *   - resourceType: 资源类型
   *   - status: 状态
   */
  app.get("/", async (request) => {
    const query = request.query as Record<string, string | undefined>;

    const filters: Record<string, string> = {};
    if (query.provider) filters.provider = query.provider;
    if (query.region) filters.region = query.region;
    if (query.resourceType) filters.resourceType = query.resourceType as ResourceType;
    if (query.status) filters.status = query.status;
    if (query.cloudAccountId) filters.cloudAccountId = query.cloudAccountId;

    return resourceService.getTopology(filters);
  });
}
