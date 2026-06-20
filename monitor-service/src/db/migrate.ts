import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

export async function runMigrations(): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(__dirname, '..', 'migrations');

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

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
