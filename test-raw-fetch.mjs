process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SUPABASE_URL = 'https://dlbeywpyjdhynflmqvgb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';

const BARBER_ID = '4710229e-81c6-48b4-a8f8-57f581d11a04';

(async () => {
  // Test 1: raw fetch storage upload 
  const testFile = Buffer.from('raw-fetch-test');
  const path = `avatars/${BARBER_ID}-rawtest.txt`;
  
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/barber-media/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'x-upsert': 'true',
      'Content-Type': 'text/plain',
    },
    body: testFile,
  });
  console.log('1. Raw fetch storage upload:', uploadRes.status, uploadRes.ok ? 'OK' : await uploadRes.text());

  // Test 2: raw fetch DB insert into portfolio_photos
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/portfolio_photos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      barber_id: BARBER_ID,
      photo_url: 'https://test.com/raw-test.jpg',
      caption: 'raw fetch test',
      media_type: 'image',
      likes_count: 0,
    }),
  });
  const insertBody = await insertRes.json();
  console.log('2. Raw fetch portfolio insert:', insertRes.status, insertRes.ok ? 'OK id=' + insertBody?.[0]?.id : JSON.stringify(insertBody));

  // cleanup
  if (insertBody?.[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/portfolio_photos?id=eq.${insertBody[0].id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
    });
    console.log('Cleanup done');
  }
})();
