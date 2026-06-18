import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query, execute, healthCheck, closePool } from './client';
import { getConfig } from '../config';
import type { QueryResultRow } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  name: string;
  up: string;
}

const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: readFileSync(join(__dirname, 'schema.sql'), 'utf-8'),
  },
];

async function ensureMigrationTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const rows = await queryAll<{ name: string }>('SELECT name FROM schema_migrations ORDER BY id');
  return rows.map(r => r.name);
}

async function applyMigration(migration: Migration): Promise<void> {
  console.log(`Applying migration: ${migration.name}`);
  await execute(migration.up);
  await execute('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
  console.log(`Migration applied: ${migration.name}`);
}

async function queryAll<T extends QueryResultRow>(text: string, params?: any[]): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

export async function runMigrations(): Promise<void> {
  const config = getConfig();
  console.log('Connecting to database...', config.databaseUrl.replace(/:[^:@]*@/, ':****@'));

  let connected = false;
  for (let i = 0; i < 10; i++) {
    connected = await healthCheck();
    if (connected) break;
    console.log(`Database connection attempt ${i + 1}/10 failed, retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!connected) {
    throw new Error('Failed to connect to database after 10 attempts');
  }

  console.log('Database connected');

  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
  console.log(`Already applied migrations: ${applied.join(', ') || 'none'}`);

  for (const migration of migrations) {
    if (!applied.includes(migration.name)) {
      await applyMigration(migration);
    } else {
      console.log(`Skipping already applied: ${migration.name}`);
    }
  }

  console.log('All migrations completed');
  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}