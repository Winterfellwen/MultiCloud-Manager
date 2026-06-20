import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { accountService } from "./services/account.service.js";
import { syncService } from "./services/sync.service.js";
import { instanceRoutes } from "./routes/instances.js";
import { resourceRoutes } from "./routes/resources.js";
import { providerRoutes, accountRoutes } from "./routes/providers.js";
import { AppError } from "@cloudops/shared";
import { runMigrations } from "./db/migrate.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

// 错误处理
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: error.message,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: "INTERNAL_ERROR",
    message: "Internal server error",
  });
});

// 健康检查
app.get("/health", async () => ({
  status: "ok",
  service: "cloud-service",
  providers: accountService.getRegisteredProviders(),
  timestamp: new Date().toISOString(),
}));

// 注册路由（API Gateway 转发 /cloud/* 到本服务）
await app.register(instanceRoutes, { prefix: "/cloud/instances" });
await app.register(resourceRoutes, { prefix: "/cloud/resources" });
await app.register(providerRoutes, { prefix: "/cloud/providers" });
await app.register(accountRoutes, { prefix: "/cloud/accounts" });

// 运行数据库迁移
await runMigrations();

// 启动时注册环境变量配置的 Provider
accountService.registerFromEnv();
// 启动时从数据库加载已保存的云账户并注册 Provider（服务重启后恢复内存 registry）
await accountService.registerFromDb();

// 启动时执行一次全量同步（异步，不阻塞启动）
syncService
  .syncAll()
  .then((results) => {
    for (const r of results) {
      app.log.info(
        `Sync ${r.provider}: ${r.synced} instances, ${r.errors.length} errors`
      );
    }
  })
  .catch((err) => {
    app.log.error({ err }, "Initial sync failed");
  });

// 定时增量同步（每 5 分钟）
setInterval(
  () => {
    syncService
      .syncAll()
      .then((results) => {
        for (const r of results) {
          if (r.errors.length > 0) {
            app.log.warn(`Sync ${r.provider} errors: ${r.errors.join("; ")}`);
          }
        }
      })
      .catch((err) => app.log.error({ err }, "Periodic sync failed"));
  },
  5 * 60 * 1000
);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Cloud service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
