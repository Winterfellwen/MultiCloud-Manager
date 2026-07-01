#!/usr/bin/env node
// scripts/seed-demo.js
// Node.js demo data seeder (replaces psql for Render compatibility)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set, skipping demo seed');
    process.exit(0);
  }

  console.log('Connecting to database...');
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // Read and execute demo-data.sql
    const sqlPath = join(__dirname, 'demo-data.sql');
    const sqlContent = readFileSync(sqlPath, 'utf-8');
    console.log('Executing demo-data.sql...');
    await sql.unsafe(sqlContent);
    console.log('Demo data seeded successfully!');

    // Verify
    const result = await sql`SELECT count(*) as count FROM demo.cloud_resources`;
    console.log(`Demo resources: ${result[0].count}`);
  } catch (err) {
    console.error('Demo seed failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
