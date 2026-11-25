import { createClient } from '@supabase/supabase-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const projectRef = 'dlbeywpyjdhynflmqvgb';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k';

const admin = createClient(`https://${projectRef}.supabase.co`, serviceKey);
const anon = createClient(`https://${projectRef}.supabase.co`, anonKey);

// Use Supabase's internal pg functions via rpc
async function execSQL(sql) {
  // Try calling a raw SQL function
  const res = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify({ sql }),
  });
  return { status: res.status, body: await res.text() };
}

(async () => {
  // The real fix: the issue is portfolio_photos RLS blocking the INSERT
  // Let's check by trying admin insert directly
  const { data: insertData, error: insertErr } = await admin.from('portfolio_photos').insert({
    barber_id: '00000000-0000-0000-0000-000000000001',
    photo_url: 'https://test.com/test.jpg',
    caption: 'test',
    media_type: 'image',
    likes_count: 0,
  }).select();
  
  console.log('Admin portfolio_photos insert:', insertErr ? 'ERR: ' + insertErr.message : 'OK: ' + JSON.stringify(insertData?.[0]?.id));

  // Clean up test row
  if (insertData?.[0]?.id) {
    await admin.from('portfolio_photos').delete().eq('id', insertData[0].id);
    console.log('Test row cleaned up');
  }

  // Now try with anon + a real user session
  // First see what columns portfolio_photos has
  const { data: sample, error: sampleErr } = await admin
    .from('portfolio_photos')
    .select('*')
    .limit(1);
  console.log('\nportfolio_photos columns sample:', JSON.stringify(sample), sampleErr?.message);

  // Check storage - try to list objects
  const { data: objs, error: listErr } = await admin.storage.from('barber-media').list('', { limit: 3 });
  console.log('\nStorage objects list:', objs?.length, 'items', listErr?.message);

  // The key question: what does the anon client send as auth header?
  // Test: sign in as barber user and try upload
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({
    email: 'hassan@sons.com', // try common email
    password: 'hassan123',
  });
  if (session?.session) {
    console.log('\nSigned in as:', session.user?.email);
    const authClient = createClient(`https://${projectRef}.supabase.co`, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.session.access_token}` } }
    });
    const tf = Buffer.from('authed-test');
    const { error: authUpErr } = await authClient.storage.from('barber-media').upload('test-authed.txt', tf, { upsert: true });
    console.log('Authenticated upload:', authUpErr ? 'FAIL: ' + authUpErr.message : 'OK!');
  } else {
    console.log('\nSign-in failed:', signErr?.message || 'unknown email/pass');
  }
})();
