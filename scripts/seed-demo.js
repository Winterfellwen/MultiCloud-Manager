#!/usr/bin/env node
// scripts/seed-demo.js
// CommonJS demo data seeder (Render compatibility)
// Uses postgres module from cloud-service/node_modules
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const postgres = require('/app/cloud-service/node_modules/postgres');

const sqlPath = join(__dirname, 'demo-data.sql');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[seed-demo] DATABASE_URL not set, skipping');
    process.exit(0);
  }

  console.log('[seed-demo] Connecting to database...');
  const sql = postgres(dbUrl, { max: 1 });

  try {
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
