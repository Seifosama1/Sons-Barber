process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

const url = 'https://dlbeywpyjdhynflmqvgb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';
const admin = createClient(url, serviceKey);

// SQL to fix Storage RLS policies on barber-media bucket
const sql = `
DROP POLICY IF EXISTS "barber_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "barber_media_select" ON storage.objects;
DROP POLICY IF EXISTS "barber_media_delete" ON storage.objects;
DROP POLICY IF EXISTS "barber_media_update" ON storage.objects;

CREATE POLICY "barber_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'barber-media');

CREATE POLICY "barber_media_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'barber-media');

CREATE POLICY "barber_media_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'barber-media');

CREATE POLICY "barber_media_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'barber-media');
`;

// Also fix portfolio_photos RLS if needed
const portfolioSql = `
-- Check if RLS is enabled on portfolio_photos
SELECT schemaname, tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'portfolio_photos';
`;

(async () => {
  // Try using the Postgres connection via supabase
  const { data, error } = await admin.rpc('exec_sql', { sql });
  if (error) {
    console.log('RPC exec_sql not available:', error.message);
    
    // Alternative: test if anon can upload after making bucket public via API
    const { error: updateErr } = await admin.storage.updateBucket('barber-media', {
      public: true,
      allowedMimeTypes: null,
      fileSizeLimit: null,
    });
    console.log('Bucket update (make public):', updateErr ? 'ERR: ' + updateErr.message : 'OK');
    
    // Test anon upload after bucket is public
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k';
    const anon = createClient(url, anonKey);
    const testFile = Buffer.from('test-after-fix');
    const { error: anonErr } = await anon.storage.from('barber-media').upload('test-anon-after.txt', testFile, { upsert: true });
    console.log('Anon upload after fix:', anonErr ? 'STILL FAIL: ' + anonErr.message : 'SUCCESS!');
  } else {
    console.log('SQL applied:', data);
  }
})();
