/**
 * 服务自迁移公共助手
 *
 * 背景：5 个服务（auth/cloud/monitor/ai-gateway/ai-agent）启动时各自执行
 * `<service>/migrations/*.sql`。原实现的问题：
 * 1. 容错码不一致（仅 auth-service 处理 42P07/42701/42P16），其余服务遇到
 *    「已存在」直接抛错导致启动失败；
 * 2. 无 42P01（表不存在）容错——跨服务依赖的索引/外键在表未建成时报错；
 * 3. demo schema（shared/src/db/migrations/000_demo_schema.sql）由 4 个服务
 *    重复执行，并发启动时 CREATE TABLE IF NOT EXISTS 之间存在 race。
 *
 * 本模块统一策略：
 * - 幂等容错码：42P07/42701/42P16/42710/23505（重试）/42P01（警告跳过，
 *   下次启动时表已建成会补上）；
 * - 全流程持有 pg_advisory_lock（固定 key），串行化多服务并发启动；
 * - 崩溃时锁随连接断开自动释放，不会死锁。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postgres from 'postgres';

/** 全局迁移 advisory lock key（固定值，所有服务共享） */
export const MIGRATION_ADVISORY_LOCK_KEY = 7285001;

/** 幂等容错：对象/列已存在 */
const ALREADY_EXISTS_CODES = new Set(['42P07', '42701', '42P16', '42710']);
/** 23505：并发 CREATE EXTENSION race，重试一次 */
const RETRY_ONCE_CODES = new Set(['23505']);
/** 42P01：依赖表尚未创建（通常由其他服务的迁移创建），警告跳过 */
const SKIP_WITH_WARNING_CODES = new Set(['42P01']);

async function runFile(
  sql: ReturnType<typeof postgres>,
  sqlText: string,
  fileLabel: string
): Promise<void> {
  try {
    await sql.unsafe(sqlText);
  } catch (err: any) {
    if (RETRY_ONCE_CODES.has(err?.code)) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        await sql.unsafe(sqlText);
        return;
      } catch (retryErr: any) {
        if (ALREADY_EXISTS_CODES.has(retryErr?.code)) {
          console.log(`  ℹ️  [${fileLabel}] Skipping (already exists): ${retryErr.message}`);
          return;
        }
        throw retryErr;
      }
    }
    if (ALREADY_EXISTS_CODES.has(err?.code)) {
      console.log(`  ℹ️  [${fileLabel}] Skipping (already exists): ${err.message}`);
      return;
    }
    if (SKIP_WITH_WARNING_CODES.has(err?.code)) {
      console.warn(`  ⚠️  [${fileLabel}] Skipping (dependency table not yet created): ${err.message}`);
      return;
    }
    throw err;
  }
}

export interface RunServiceMigrationsOptions {
  /** 服务名（日志前缀） */
  serviceName: string;
  /** 数据库连接串 */
  databaseUrl: string;
  /**
   * 该服务的迁移目录。传相对路径时基于 process.cwd() 解析
   * （Render 容器内 cwd 为 /app，形如 'monitor-service/migrations'）；
   * 也可传绝对路径（本地直接运行 migrate.ts 时基于 import.meta.url 解析）。
   */
  migrationsDir: string;
  /** 是否附带执行 shared 的 demo schema 迁移，默认 true */
  includeDemoSchema?: boolean;
}

/**
 * 执行单个服务的全部迁移（持 advisory lock 串行化）。
 */
export async function runServiceMigrations(options: RunServiceMigrationsOptions): Promise<void> {
  const { serviceName, databaseUrl, migrationsDir, includeDemoSchema = true } = options;

  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });

  try {
    // 会话级 advisory lock：并发启动时串行化；进程崩溃则锁自动释放
    await sql`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
  } catch (err) {
    console.error(`[${serviceName}] Failed to acquire migration lock:`, err);
    await sql.end();
    throw err;
  }

  try {
    const resolvedDir = resolve(process.cwd(), migrationsDir);
    if (!existsSync(resolvedDir)) {
      console.warn(`[${serviceName}] Migrations dir not found: ${resolvedDir}`);
    } else {
      const files = readdirSync(resolvedDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        console.log(`[${serviceName}] Applying migration: ${file}`);
        const sqlText = readFileSync(join(resolvedDir, file), 'utf-8');
        await runFile(sql, sqlText, file);
      }
    }

    if (includeDemoSchema) {
      const demoPath = resolve(process.cwd(), 'shared', 'src', 'db', 'migrations', '000_demo_schema.sql');
      if (existsSync(demoPath)) {
        console.log(`[${serviceName}] Running migration: 000_demo_schema.sql`);
        await runFile(sql, readFileSync(demoPath, 'utf-8'), '000_demo_schema.sql');
      }
    }

    console.log(`[${serviceName}] Migrations complete.`);
  } finally {
    await sql`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_KEY})`;
    await sql.end();
  }
}
