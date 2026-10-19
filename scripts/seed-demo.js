#!/usr/bin/env node
// scripts/seed-demo.js
//
// 幂等 demo 数据初始化器（CommonJS，容器内 /app 直接运行）。
//
// 【数据隔离保证】
//   1. 执行的 SQL（scripts/demo-data.sql）全部限定 demo.* schema，绝不写入 public
//   2. 写入前先对 public 业务表做行数快照，写入后再比对；只要有任何一张 public
//      业务表行数发生变化，立即以非 0 退出码报错，提示人工排查（不做自动回滚，
//      避免误伤真实数据）
//   3. 使用 DATABASE_URL 单连接串行执行，不修改 search_path，未限定 schema 的
//      语句会落到 public，从而被上面的快照校验捕获
//
// 用法：
//   DATABASE_URL=postgresql://... node scripts/seed-demo.js
//
// 环境变量：
//   DEMO_SQL_PATH    自定义 SQL 文件路径（默认 scripts/demo-data.sql）
//   DEMO_SEED_FORCE  设为 "true" 时跳过 public 快照校验（不建议）

const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

function loadPostgres() {
  const candidates = [
    process.env.DEMO_PG_MODULE,
    resolve(__dirname, '..', 'cloud-service', 'node_modules', 'postgres'),
    resolve(__dirname, '..', 'shared', 'node_modules', 'postgres'),
    '/app/cloud-service/node_modules/postgres',
    '/app/shared/node_modules/postgres',
    'postgres',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* 尝试下一个候选路径 */
    }
  }
  throw new Error('未找到 postgres 模块，请通过 DEMO_PG_MODULE 指定路径');
}

const postgres = loadPostgres();

// public（真实环境）业务表清单：仅用于完整性快照比对
const PUBLIC_TABLES = [
  'instances',
  'cloud_resources',
  'cloud_accounts',
  'alerts',
  'alert_rules',
  'metrics',
  'cost_records',
  'remediation_runs',
  'remediation_policies',
  'knowledge_base',
  'metric_predictions',
  'token_usage',
  'notifications',
  'insight_history',
  'users',
  'audit_logs',
  'chat_sessions',
  'chat_messages',
  'llm_providers',
  'llm_models',
  'budgets',
  'silence_windows',
  'notification_channels',
  'teams',
];

const MAX_RETRIES = Number(process.env.DEMO_SEED_RETRIES || 24);
const RETRY_INTERVAL = 5000;

async function snapshotPublic(sql) {
  const counts = {};
  for (const table of PUBLIC_TABLES) {
    try {
      const res = await sql.unsafe(`SELECT count(*)::bigint AS c FROM public.${table}`);
      counts[table] = Number(res[0].c);
    } catch {
      counts[table] = null; // 表不存在（例如迁移尚未执行）
    }
  }
  return counts;
}

function diffPublic(before, after) {
  const changes = [];
  for (const table of PUBLIC_TABLES) {
    if (before[table] !== after[table]) {
      changes.push(`${table}: ${before[table]} -> ${after[table]}`);
    }
  }
  return changes;
}

async function waitForDemoSchema(sql) {
  let lastErr = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'demo' AND table_name = 'instances'
        ) AS exists`;
      if (res[0].exists) return true;
    } catch (e) {
      lastErr = e;
    }
    console.log(`[seed-demo] 等待 demo schema 就绪... (${i + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
  }
  if (lastErr) console.error(`[seed-demo] 最后一次错误: ${lastErr.message}`);
  return false;
}

async function tableCount(sql, schema, table) {
  const res = await sql.unsafe(`SELECT count(*)::bigint AS c FROM ${schema}.${table}`);
  return Number(res[0].c);
}

/**
 * 判断连接是否需要 TLS。
 * Render 外部连接串（*.region-postgres.render.com）强制要求 SSL；
 * 容器内网短主机名（dpg-xxxx-a）与本地 docker 主机名不要求。
 * 可用 DEMO_DB_SSL=true/false 强制覆盖。
 */
function resolveSsl(dbUrl) {
  if (process.env.DEMO_DB_SSL === 'true') return { rejectUnauthorized: false };
  if (process.env.DEMO_DB_SSL === 'false') return false;
  try {
    const host = new URL(dbUrl).hostname;
    const isInternal =
      !host.includes('.') ||
      ['localhost', 'postgres', 'db', '127.0.0.1'].includes(host);
    return isInternal ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[seed-demo] 未设置 DATABASE_URL，跳过');
    process.exit(0);
  }

  const sqlPath = process.env.DEMO_SQL_PATH
    ? resolve(process.env.DEMO_SQL_PATH)
    : join(__dirname, 'demo-data.sql');
  if (!existsSync(sqlPath)) {
    console.error(`[seed-demo] 未找到 SQL 文件: ${sqlPath}`);
    process.exit(1);
  }

  console.log('[seed-demo] 连接数据库...');
  const sql = postgres(dbUrl, {
    max: 1,
    connect_timeout: 15,
    idle_timeout: 20,
    ssl: resolveSsl(dbUrl),
  });

  try {
    if (!(await waitForDemoSchema(sql))) {
      console.error('[seed-demo] demo schema 未在超时时间内就绪，请检查迁移');
      process.exit(1);
    }
    console.log('[seed-demo] demo schema 已就绪');

    const skipCheck = process.env.DEMO_SEED_FORCE === 'true';
    const before = skipCheck ? null : await snapshotPublic(sql);
    if (!skipCheck) {
      const total = Object.values(before).reduce((a, b) => a + (b || 0), 0);
      console.log(`[seed-demo] public 快照已记录（${PUBLIC_TABLES.length} 表 / ${total} 行）`);
    }

    const sqlContent = readFileSync(sqlPath, 'utf-8');
    console.log(`[seed-demo] 执行 ${sqlPath} ...`);
    await sql.unsafe(sqlContent);
    console.log('[seed-demo] demo 数据写入完成');

    if (!skipCheck) {
      const after = await snapshotPublic(sql);
      const changes = diffPublic(before, after);
      if (changes.length > 0) {
        console.error('[seed-demo] ✗ 检测到 public（真实环境）数据发生变化，已中止：');
        for (const c of changes) console.error(`    - ${c}`);
        console.error('[seed-demo] 请立即人工排查，确保 demo 与真实数据严格隔离');
        process.exit(2);
      }
      console.log('[seed-demo] ✓ public 真实数据未发生任何变化（严格隔离校验通过）');
    }

    const verifyTables = [
      'cloud_accounts',
      'instances',
      'cloud_resources',
      'alert_rules',
      'alerts',
      'cost_records',
      'metrics',
      'token_usage',
      'remediation_runs',
      'knowledge_base',
      'metric_predictions',
      'notifications',
      'insight_history',
    ];
    const summary = {};
    for (const t of verifyTables) {
      summary[t] = await tableCount(sql, 'demo', t);
    }
    console.log('[seed-demo] demo 数据统计:', JSON.stringify(summary));
    console.log('[seed-demo] 完成');
  } catch (err) {
    console.error('[seed-demo] 失败:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
