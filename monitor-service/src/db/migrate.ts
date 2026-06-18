import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

async function migrate() {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(process.cwd(), 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await sql.unsafe(content);
  }

  console.log('Migrations complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
