import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const migrationsDir = join(__dirname, '..', 'migrations');

export async function runMigrations(): Promise<void> {
  console.log('Running migrations...');
  
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  
  for (const file of files) {
    console.log(`Applying migration: ${file}`);
    const sqlText = readFileSync(join(migrationsDir, file), 'utf-8');
    await db.execute(sql.raw(sqlText));
  }
  
  console.log('Migrations complete.');
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