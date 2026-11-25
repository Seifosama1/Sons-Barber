/**
 * Run a SQL migration file against the Supabase database via direct Postgres connection.
 *
 * Usage:
 *   node scripts/run-migration.mjs <migration-file.sql> <db-password>
 */
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import pg from 'pg';

const { Client } = pg;

const DB_HOST = 'db.dlbeywpyjdhynflmqvgb.supabase.co';
const DB_PORT = 5432;
const DB_NAME = 'postgres';
const DB_USER = 'postgres';

const sqlFile = process.argv[2];
const dbPassword = process.argv[3];

if (!sqlFile || !dbPassword) {
  console.error('Usage: node scripts/run-migration.mjs <migration-file.sql> <db-password>');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

// Resolve hostname manually (Node.js pg needs help with IPv6-only hosts)
let host = DB_HOST;
try {
  const records = await lookup(DB_HOST, { family: 6 });
  host = records.address;
  console.log(`Resolved ${DB_HOST} -> ${host} (IPv6)`);
} catch {
  console.log(`Could not resolve IPv6, trying hostname directly: ${DB_HOST}`);
}

const client = new Client({
  host: host,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

console.log(`Running migration: ${sqlFile}`);
console.log(`Connecting to ${host}:${DB_PORT} ...`);

try {
  await client.connect();
  console.log('Connected. Executing SQL...\n');
  await client.query(sql);
  console.log('✅ Migration applied successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  if (err.detail) console.error('   Detail:', err.detail);
  if (err.hint) console.error('   Hint:', err.hint);
  process.exit(1);
} finally {
  await client.end();
}
