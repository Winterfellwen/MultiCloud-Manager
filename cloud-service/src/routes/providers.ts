import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { accountService } from "../services/account.service.js";
import { getProvider, listProviders } from "../providers/registry.js";
import { NotFoundError } from "@cloudops/shared";

const createAccountSchema = z.object({
  name: z.string().min(1).max(128),
  provider: z.enum(["aws", "aliyun", "azure"]),
  config: z.record(z.unknown()),
});

export async function providerRoutes(app: FastifyInstance) {
  // 列出已注册的 Provider
  app.get("/", async () => {
    return { providers: accountService.getRegisteredProviders() };
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
  // 列出云账号
  app.get("/", async () => {
    return accountService.list();
  });

  // 获取单个云账号
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    return accountService.getById(id);
  });

  // 添加云账号
  app.post("/", async (request, reply) => {
    const input = createAccountSchema.parse(request.body);
    const account = await accountService.create(input);
    return reply.status(201).send(account);
  });

  // 删除云账号
  app.delete("/:id", async (request) => {
    const { id } = request.params as { id: string };
    await accountService.delete(id);
    return { ok: true, id };
  });
}
