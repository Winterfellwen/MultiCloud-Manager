import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';
import { config } from '../config.js';

async function runFile(sql: ReturnType<typeof postgres>, sqlText: string): Promise<void> {
  try {
    await sql.unsafe(sqlText);
  } catch (err: any) {
    if (err?.code === '23505') {
      // concurrent CREATE EXTENSION race — retry once after a short delay
      await new Promise(r => setTimeout(r, 200));
      await sql.unsafe(sqlText);
    } else if (err?.code === '42P07' || err?.code === '42701' || err?.code === '42P16') {
      // relation / column already exists — skip (idempotent migration)
      console.log(`  ℹ️  Skipping (already exists): ${err.message}`);
    } else {
      throw err;
    }
  }
}

export async function runMigrations(): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(process.cwd(), 'auth-service', 'migrations');

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Applying migration: ${file}`);
    const sqlText = readFileSync(join(migrationsDir, file), 'utf-8');
    await runFile(sql, sqlText);
  }

  console.log('Migrations complete.');
  await sql.end();
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
