import { readFileSync, readdirSync } from 'node:fs';
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

  console.log('Migrations complete.');
  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
