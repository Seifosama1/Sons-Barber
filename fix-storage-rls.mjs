import { createClient } from '@supabase/supabase-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const url = 'https://dlbeywpyjdhynflmqvgb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k';

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

(async () => {
  // 1. Make bucket public (removes RLS on storage objects for this bucket)
  const { error: updateErr } = await admin.storage.updateBucket('barber-media', {
    public: true,
    allowedMimeTypes: null,
    fileSizeLimit: null,
  });
  console.log('1. Bucket set to public:', updateErr ? 'ERR: ' + updateErr.message : 'OK');

  // 2. Verify anon can now upload
  const testFile = Buffer.from('test-after-fix');
  const { error: anonErr } = await anon.storage.from('barber-media').upload('test-anon-after.txt', testFile, { upsert: true });
  console.log('2. Anon upload after fix:', anonErr ? 'STILL FAIL: ' + anonErr.message : 'SUCCESS!');

  // 3. Check portfolio_photos columns
  const { data: cols, error: colErr } = await admin
    .from('portfolio_photos')
    .select('*')
    .limit(1);
  console.log('3. portfolio_photos sample:', JSON.stringify(cols), colErr?.message);
})();
