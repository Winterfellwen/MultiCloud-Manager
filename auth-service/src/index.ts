import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { auditRoutes } from './routes/audit.js';
import { internalAuditRoutes } from './routes/internal-audit.js';
import { teamRoutes } from './routes/teams.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@cloudops/shared';

const SALT_ROUNDS = 10;

function generateRandomPassword(length = 20): string {
  // URL-safe base64，但剔除易混淆字符（0/O/1/l/I/+）
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function seedAdminIfNeeded(): Promise<void> {
  try {
    const username = config.admin.username || 'admin';
    const envPassword = config.admin.password;

    // 查 admin 用户是否已存在
    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);

    // 场景 1: 已设置 ADMIN_PASSWORD —— 每次启动都更新密码（确保环境变量生效）
    if (envPassword) {
      const passwordHash = await bcrypt.hash(envPassword, SALT_ROUNDS);

      if (existing.length > 0) {
        await db.update(users).set({ passwordHash }).where(eq(users.username, username));
        console.log('');
        console.log('========================================');
        console.log('  🔑  已同步管理员密码（来自 ADMIN_PASSWORD）');
        console.log('     用户名: ' + username);
        console.log('========================================');
        console.log('');
      } else {
        await db.insert(users).values({
          username,
          email: `${username}@localhost.invalid`,
          passwordHash,
          role: 'admin',
        });
        console.log('');
        console.log('========================================');
        console.log('  🔑  已创建管理员账号（来自 ADMIN_PASSWORD）');
        console.log('     用户名: ' + username);
        console.log('========================================');
        console.log('');
      }
      return;
    }

    // 场景 2: 未设置 ADMIN_PASSWORD —— 仅在表为空时随机生成（一次性）
    const allUsers = await db.select().from(users).limit(1);
    if (allUsers.length > 0) {
      // 已有用户且未设置 ADMIN_PASSWORD —— 什么也不做
      return;
    }

    const password = generateRandomPassword(20);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.insert(users).values({
      username,
      email: `${username}@localhost.invalid`,
      passwordHash,
      role: 'admin',
    });

    console.log('');
    console.log('========================================');
    console.log('  🔑  首次部署 —— 已创建管理员账号');
    console.log('     用户名: ' + username);
    console.log('     密码:   ' + password);
    console.log('     (本次启动时随机生成，仅显示一次)');
    console.log('');
    console.log('  提示: 如需固定密码，请设置 ADMIN_PASSWORD 环境变量');
    console.log('  并重新部署服务，系统会自动同步新密码。');
    console.log('========================================');
    console.log('');
  } catch (err) {
    // 表不存在等情况在此静默跳过，不阻断服务启动
    console.log('ℹ️  跳过 admin 种子账号（数据库未就绪）:', (err as Error).message);
  }
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

try {
  await runMigrations();
  console.log('✅ Database migrations completed successfully');
  await seedAdminIfNeeded();
} catch (err) {
  console.error('⚠️  Database migration failed:', (err as Error).message);
  console.log('   Continuing without database - /health will still work');
}

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
});

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(userRoutes, { prefix: '/users' });
await app.register(auditRoutes, { prefix: '/audit' });
await app.register(teamRoutes, { prefix: '/auth' });
await app.register(internalAuditRoutes, { prefix: '/internal' });

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Auth service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// 优雅关闭
async function shutdown(signal: string) {
  app.log.info(`Received ${signal}, shutting down...`);
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));