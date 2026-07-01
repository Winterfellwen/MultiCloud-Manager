import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { accountService } from "./services/account.service.js";
import { syncService } from "./services/sync.service.js";
import { instanceRoutes } from "./routes/instances.js";
import { resourceRoutes } from "./routes/resources.js";
import { providerRoutes, accountRoutes } from "./routes/providers.js";
import { topologyRoutes } from "./routes/topology.js";
import { AppError } from "@cloudops/shared";
import { scopeFromDemoFlag, PUBLIC_SCOPE, type RequestScope } from "@cloudops/shared";
import { runMigrations } from "./db/migrate.js";

declare module 'fastify' {
  interface FastifyRequest {
    scope: RequestScope;
  }
}

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

  // 处理 ZodError（参数验证错误）
  const err = error as any;
  if (err.name === 'ZodError' && err.issues) {
    const issues = err.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: `参数验证失败: ${issues}`,
      details: err.issues,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: error.message,
    });
  }

  // 处理 Azure SDK RestError
  if (err.statusCode && err.message) {
    return reply.status(err.statusCode).send({
      error: err.code || "PROVIDER_ERROR",
      message: err.message,
      details: err.details,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: "INTERNAL_ERROR",
    message: `服务内部错误: ${error.message || '未知错误'}`,
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
await app.register(topologyRoutes, { prefix: "/cloud/topology" });

// scope 注入（demo/生产数据隔离）+ 首次访问云资源时触发同步
app.addHook('onRequest', async (request) => {
  const isDemo = request.headers['x-demo-mode'] === 'true';
  const userId = (request.headers['x-scope-user-id'] as string) || '';
  request.scope = scopeFromDemoFlag(isDemo, userId);

  if (request.url.startsWith('/cloud/') && request.url !== '/cloud/accounts') {
    ensureInitialSync().catch(() => {});
  }
});

// 运行数据库迁移
try {
  await runMigrations();
  console.log('✅ Cloud service database migrations completed');
} catch (err) {
  console.error('⚠️  Cloud service database migration failed:', (err as Error).message);
  console.log('   Continuing - /health will work, DB features disabled');
}

// 启动时注册环境变量配置的 Provider
try {
  await accountService.registerFromEnv();
} catch (err) {
  console.error('⚠️  Failed to register providers from env:', (err as Error).message);
}

// 启动时从数据库加载已保存的云账户
try {
  await accountService.registerFromDb();
} catch (err) {
  console.error('⚠️  Failed to load providers from DB:', (err as Error).message);
}

// 首次请求时触发全量同步（延迟加载，避免启动时内存尖峰）
let initialSyncDone = false;
async function ensureInitialSync() {
  if (initialSyncDone) return;
  initialSyncDone = true;
  try {
    const results = await syncService.syncAll(PUBLIC_SCOPE);
    for (const r of results) {
      app.log.info(
        `Sync ${r.provider}: ${r.synced} instances, ${r.errors.length} errors`
      );
    }
  } catch (err) {
    app.log.error({ err }, "Initial sync failed");
  }
}

// 定时增量同步（每 5 分钟，首次同步后才启动）
const syncInterval = setInterval(
  () => {
    if (!initialSyncDone) return;
    syncService
      .syncAll(PUBLIC_SCOPE)
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

// 优雅关闭
async function shutdown(signal: string) {
  app.log.info(`Received ${signal}, shutting down...`);
  clearInterval(syncInterval);
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
