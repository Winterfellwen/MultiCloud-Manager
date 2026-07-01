import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

async function runFile(sql: ReturnType<typeof postgres>, sqlText: string): Promise<void> {
  try {
    await sql.unsafe(sqlText);
  } catch (err: any) {
    if (err?.code === '23505') {
      await new Promise(r => setTimeout(r, 200));
      await sql.unsafe(sqlText);
    } else {
      throw err;
    }
  }
}

export async function runMigrations(): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(process.cwd(), 'monitor-service', 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await runFile(sql, content);
  }

  // 执行 demo schema 建表（幂等，多服务启动安全）
  const demoSchemaPath = join(process.cwd(), 'shared', 'src', 'db', 'migrations', '000_demo_schema.sql');
  if (existsSync(demoSchemaPath)) {
    console.log('Running migration: 000_demo_schema.sql');
    const demoContent = readFileSync(demoSchemaPath, 'utf-8');
    await runFile(sql, demoContent);
  }

  console.log('Migrations complete.');
  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
