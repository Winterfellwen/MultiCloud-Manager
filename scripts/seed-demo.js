#!/usr/bin/env node
// scripts/seed-demo.js
// CommonJS demo data seeder with retry (waits for migrations)
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const postgres = require('/app/cloud-service/node_modules/postgres');

const sqlPath = join(__dirname, 'demo-data.sql');
const MAX_RETRIES = 30;
const RETRY_INTERVAL = 5000;

async function waitForMigrations(sql) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await sql`SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'instances'
      ) as exists`;
      if (res[0].exists) {
        console.log('[seed-demo] Public tables ready');
        return true;
      }
    } catch { /* ignore */ }
    console.log(`[seed-demo] Waiting for migrations... (${i + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, RETRY_INTERVAL));
  }
  return false;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[seed-demo] DATABASE_URL not set, skipping');
    process.exit(0);
  }

  console.log('[seed-demo] Connecting to database...');
  const sql = postgres(dbUrl, { max: 1 });

  try {
    const ready = await waitForMigrations(sql);
    if (!ready) {
      console.error('[seed-demo] Migrations not ready after timeout');
      process.exit(1);
    }

    const sqlContent = readFileSync(sqlPath, 'utf-8');
    console.log('[seed-demo] Executing demo-data.sql...');
    await sql.unsafe(sqlContent);
    console.log('[seed-demo] Demo data seeded successfully!');

    const res = await sql`SELECT count(*) as count FROM demo.cloud_resources`;
    console.log('[seed-demo] Demo resources:', res[0].count);
  } catch (err) {
    console.error('[seed-demo] Failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
