# Run a SQL file against the Supabase database via direct Postgres connection.
#
# Usage:
#   .\scripts\run-sql.ps1 -File migrations\007_fixes.sql -Password <your-db-password>
#   .\scripts\run-sql.ps1 -Sql "SELECT * FROM profiles" -Password <your-db-password>
#
# Get your DB password from:
#   Supabase Dashboard > Project Settings > Database > Database password
param(
  [string]$File,
  [string]$Sql,
  [string]$Password
)

if (-not $Password) {
  Write-Error "You must provide -Password (your Supabase database password)."
  Write-Host "Get it from: Supabase Dashboard > Project Settings > Database"
  exit 1
}

if ($File) {
  $SqlContent = Get-Content $File -Raw
} elseif ($Sql) {
  $SqlContent = $Sql
} else {
  Write-Error "Provide either -File <path> or -Sql <query>"
  exit 1
}

$nodeScript = @'
import { readFileSync } from 'node:fs';
import pg from 'pg';
const { Client } = pg;

const sql = process.env.SQL_CONTENT;
const password = process.env.DB_PASSWORD;

const client = new Client({
  host: 'db.dlbeywpyjdhynflmqvgb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const res = await client.query(sql);
  if (res.rows && res.rows.length > 0) {
    console.table(res.rows);
  } else {
    console.log('OK - command completed.');
  }
} catch (err) {
  console.error('Error:', err.message);
  if (err.detail) console.error('Detail:', err.detail);
  process.exit(1);
} finally {
  await client.end();
}
'@

$env:SQL_CONTENT = $SqlContent
$env:DB_PASSWORD = $Password

node --input-type=module -e $nodeScript

Remove-Item Env:SQL_CONTENT
Remove-Item Env:DB_PASSWORD
