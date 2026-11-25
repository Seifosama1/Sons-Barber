import { createClient } from '@supabase/supabase-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const projectRef = 'dlbeywpyjdhynflmqvgb';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k';

// Use fetch with Supabase's pg endpoint
async function runSQL(sql) {
  const response = await fetch(`https://${projectRef}.supabase.co/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

// Try the management API endpoint
async function runSQLMgmt(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

// Try Supabase's direct pg executor
async function runSQLDirect(sql) {
  const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'params=single-object',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

const admin = createClient(`https://${projectRef}.supabase.co`, serviceKey);
const anon = createClient(`https://${projectRef}.supabase.co`, anonKey);

(async () => {
  // Check existing RLS policies on storage.objects
  console.log('Checking storage policies...');
  const { data: policies, error: polErr } = await admin
    .from('pg_policies')
    .select('*')
    .eq('schemaname', 'storage')
    .eq('tablename', 'objects');
  
  if (polErr) {
    console.log('pg_policies query error:', polErr.message);
  } else {
    console.log('Storage policies:', JSON.stringify(policies, null, 2));
  }

  // Try pg/ endpoint for SQL
  console.log('\nTrying pg/query endpoint...');
  const r1 = await runSQL("SELECT current_user, session_user");
  console.log('pg/query result:', r1.status, r1.body.substring(0, 200));

  // Try management API
  console.log('\nTrying mgmt API...');
  const r2 = await runSQLMgmt("SELECT 1 as test");
  console.log('mgmt API result:', r2.status, r2.body.substring(0, 200));
})();
