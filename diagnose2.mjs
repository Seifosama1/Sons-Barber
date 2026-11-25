import { createClient } from '@supabase/supabase-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const projectRef = 'dlbeywpyjdhynflmqvgb';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTgzNTIsImV4cCI6MjExMDMzNDM1Mn0.7Jiz5RJ_PjTVm4EvgDfShJoaWM6r90LCvUR-mvDxJ4k';

const admin = createClient(`https://${projectRef}.supabase.co`, serviceKey);
const anon = createClient(`https://${projectRef}.supabase.co`, anonKey);

(async () => {
  // Get actual barber user id from profiles
  const { data: barbers, error: bErr } = await admin.from('profiles')
    .select('id, name, role')
    .eq('role', 'barber');
  console.log('Barbers:', JSON.stringify(barbers), bErr?.message);

  if (barbers?.[0]) {
    const barberId = barbers[0].id;
    console.log('\nTesting portfolio_photos insert with real barber id:', barberId);

    // Test with admin
    const { data: d1, error: e1 } = await admin.from('portfolio_photos').insert({
      barber_id: barberId,
      photo_url: 'https://test.com/test.jpg',
      caption: 'test admin',
      media_type: 'image',
      likes_count: 0,
    }).select('id');
    console.log('Admin insert:', e1 ? 'ERR: ' + e1.message : 'OK id=' + d1?.[0]?.id);
    
    // cleanup
    if (d1?.[0]?.id) await admin.from('portfolio_photos').delete().eq('id', d1[0].id);

    // Test with anon (simulates browser without supabaseAdmin)
    const { data: d2, error: e2 } = await anon.from('portfolio_photos').insert({
      barber_id: barberId,
      photo_url: 'https://test.com/test.jpg',
      caption: 'test anon',
      media_type: 'image',
      likes_count: 0,
    }).select('id');
    console.log('Anon insert:', e2 ? 'ERR: ' + e2.message : 'OK id=' + d2?.[0]?.id);
    if (d2?.[0]?.id) await admin.from('portfolio_photos').delete().eq('id', d2[0].id);

    // Test storage upload with anon 
    const tf = Buffer.from('anon-test');
    const { error: sErr } = await anon.storage.from('barber-media').upload(`avatars/${barberId}-test.txt`, tf, { upsert: true });
    console.log('Anon storage upload:', sErr ? 'ERR: ' + sErr.message : 'OK');
  }
})();
