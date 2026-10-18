import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runServiceMigrations } from '@cloudops/shared';
import { config } from '../config.js';

/**
 * 解析本服务的 migrations 目录。
 * 编译后为 <service>/dist/db/migrate.js，上两级即 <service>/；
 * 本地 tsx 直接跑 src/db/migrate.ts 时同样成立。
 */
const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export async function runMigrations(): Promise<void> {
  await runServiceMigrations({
    serviceName: 'auth-service',
    databaseUrl: config.databaseUrl,
    migrationsDir,
    // auth-service 无 demo schema 依赖（原实现即无）
    includeDemoSchema: false,
  });
}

async function main() {
  await runMigrations();
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
