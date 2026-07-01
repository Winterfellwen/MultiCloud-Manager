import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { accountService } from "../services/account.service.js";
import { getProvider, listProviders } from "../providers/registry.js";
import { recordAudit, NotFoundError, CLOUD_PROVIDERS, CLOUD_GUIDES } from "@cloudops/shared";
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

const createAccountSchema = z.object({
  name: z.string().min(1).max(128),
  provider: z.enum(["aws", "aliyun", "azure", "tencent", "huawei", "render", "oracle"]),
  config: z.record(z.unknown()),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.string().min(1).max(16).optional(),
});

export async function providerRoutes(app: FastifyInstance) {
  // 列出已注册的 Provider
  app.get("/", async () => {
    return { providers: accountService.getRegisteredProviders() };
  });

  // 列出支持的云厂商元数据（前端用于动态渲染表单）
  app.get("/meta", async () => {
    // 将指引数据附加到每个厂商元数据中
    const providersWithGuide = CLOUD_PROVIDERS.map(p => ({
      ...p,
      guide: CLOUD_GUIDES[p.id],
    }));
    return { providers: providersWithGuide };
  });

  // 列出指定 Provider 的可用区域
  app.get("/:provider/regions", async (request) => {
    const { provider } = request.params as { provider: string };
    if (!listProviders().includes(provider)) {
      throw new NotFoundError("Provider", provider);
    }
    return getProvider(provider).listRegions();
  });

  // 列出指定 Provider 的可用镜像
  app.get("/:provider/images", async (request) => {
    const { provider } = request.params as { provider: string };
    if (!listProviders().includes(provider)) {
      throw new NotFoundError("Provider", provider);
    }
    return getProvider(provider).listImages();
  });

  // 列出指定 Provider 指定区域的实例规格
  app.get("/:provider/instance-types/:region", async (request) => {
    const { provider, region } = request.params as { provider: string; region: string };
    if (!listProviders().includes(provider)) {
      throw new NotFoundError("Provider", provider);
    }
    return getProvider(provider).listInstanceTypes(region);
  });
}

export async function accountRoutes(app: FastifyInstance) {
  // 列出云账号（凭证已脱敏）
  app.get("/", async () => {
    return accountService.list();
  });

  // 获取单个云账号（凭证已脱敏）
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    return accountService.getById(id);
  });

  // 添加云账号
  app.post("/", async (request, reply) => {
    const input = createAccountSchema.parse(request.body);
    const account = await accountService.create(input);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'account.create',
      resourceType: 'cloud_account',
      resourceId: account.id,
      provider: input.provider,
      result: 'success',
      ip: getIp(request),
      traceId: getTraceId(request),
    });
    return reply.status(201).send(account);
  });

  // 删除云账号
  app.delete("/:id", async (request) => {
    const { id } = request.params as { id: string };
    await accountService.delete(id);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'account.delete',
      resourceType: 'cloud_account',
      resourceId: id,
      result: 'success',
      ip: getIp(request),
      traceId: getTraceId(request),
    });
    return { ok: true, id };
  });

  // 更新云账号（名称、配置、状态）
  app.put("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = updateAccountSchema.parse(request.body);
    const account = await accountService.update(id, input);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'account.update',
      resourceType: 'cloud_account',
      resourceId: id,
      result: 'success',
      ip: getIp(request),
      traceId: getTraceId(request),
    });
    return account;
  });

  // PATCH 别名（同 PUT）
  app.patch("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = updateAccountSchema.parse(request.body);
    const account = await accountService.update(id, input);
    await recordAudit(config.authServiceUrl, {
      userId: getUserId(request),
      action: 'account.update',
      resourceType: 'cloud_account',
      resourceId: id,
      result: 'success',
      ip: getIp(request),
      traceId: getTraceId(request),
    });
    return account;
  });

  // 测试云账号连通性
  app.post("/:id/test", async (request) => {
    const { id } = request.params as { id: string };
    return accountService.testConnection(id);
  });
}
