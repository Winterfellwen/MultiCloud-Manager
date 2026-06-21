import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { instanceService } from "../services/instance.service.js";
import { syncService } from "../services/sync.service.js";
import { getProvider } from "../providers/registry.js";

const createInstanceSchema = z.object({
  provider: z.string(),
  region: z.string(),
  name: z.string().min(1).max(128),
  imageId: z.string(),
  instanceType: z.string(),
  subnetId: z.string().optional(),
  securityGroupIds: z.array(z.string()).optional(),
  tags: z.record(z.string()).optional(),
});

export async function instanceRoutes(app: FastifyInstance) {
  // 列出实例（从本地缓存）
  app.get("/", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return instanceService.list({
      provider: query.provider,
      region: query.region,
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });
  });

  // 获取实例详情
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    return instanceService.getById(id);
  });

  // 创建实例
  app.post("/", async (request, reply) => {
    try {
      const input = createInstanceSchema.parse(request.body);
      const instance = await instanceService.create(input);
      return reply.status(201).send(instance);
    } catch (err: any) {
      // 处理 ZodError（参数验证错误）
      if (err.name === 'ZodError' && err.issues) {
        const issues = err.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: `参数验证失败: ${issues}`,
          details: err.issues,
        });
      }
      // 处理云厂商 SDK 错误
      if (err.statusCode && err.message) {
        return reply.status(err.statusCode).send({
          error: err.code || "PROVIDER_ERROR",
          message: err.message,
          details: err.details,
        });
      }
      // 其他错误
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: err.message || "创建实例失败",
      });
    }
  });

  // 启动实例
  app.post("/:id/start", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await instanceService.start(id);
      return { ok: true, id, status: "running" };
    } catch (err: any) {
      if (err.statusCode && err.message) {
        return reply.status(err.statusCode).send({
          error: err.code || "PROVIDER_ERROR",
          message: err.message,
          details: err.details,
        });
      }
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: err.message || "启动实例失败",
      });
    }
  });

  // 停止实例
  app.post("/:id/stop", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await instanceService.stop(id);
      return { ok: true, id, status: "stopped" };
    } catch (err: any) {
      if (err.statusCode && err.message) {
        return reply.status(err.statusCode).send({
          error: err.code || "PROVIDER_ERROR",
          message: err.message,
          details: err.details,
        });
      }
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: err.message || "停止实例失败",
      });
    }
  });

  // 重启实例
  app.post("/:id/reboot", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await instanceService.reboot(id);
      return { ok: true, id, status: "running" };
    } catch (err: any) {
      if (err.statusCode && err.message) {
        return reply.status(err.statusCode).send({
          error: err.code || "PROVIDER_ERROR",
          message: err.message,
          details: err.details,
        });
      }
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: err.message || "重启实例失败",
      });
    }
  });

  // 删除实例
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await instanceService.delete(id);
      return { ok: true, id };
    } catch (err: any) {
      if (err.statusCode && err.message) {
        return reply.status(err.statusCode).send({
          error: err.code || "PROVIDER_ERROR",
          message: err.message,
          details: err.details,
        });
      }
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: err.message || "删除实例失败",
      });
    }
  });

  // 查询实例指标（供 monitor-service 调用）
  app.get("/:id/metrics", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { start?: string; end?: string };
    const row = await instanceService.getById(id);
    const provider = getProvider(row.provider);

    const end = query.end ? new Date(query.end) : new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(end.getTime() - 60 * 60 * 1000); // 默认最近 1 小时

    return provider.getMetrics(row.providerInstanceId, { start, end });
  });

  // 触发资源同步
  app.post("/sync", async (request) => {
    const query = request.query as { provider?: string };
    if (query.provider) {
      return [await syncService.syncProvider(query.provider)];
    }
    return syncService.syncAll();
  });
}
