// Supabase Edge Function: notify-barber-queue
// Called by the client app after a successful waitlist insert.
// Sends a Web Push notification to all of the barber's registered devices.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@sonsbarber.app'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { barber_id, client_name, queue_count } = await req.json()

    if (!barber_id) {
      return json({ error: 'barber_id required' }, 400)
    }

    // 1. Fetch all Web Push subscriptions for this barber
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('subscription_json')
      .eq('user_id', barber_id)
      .eq('device_type', 'web')

    if (subErr || !subs?.length) {
      return json({ sent: 0, reason: 'no_subscriptions' })
    }

    // 2. Build notification payload
    const count = queue_count ?? 1
    const title = `طابورك — ${count} ${count === 1 ? 'عميل' : 'عملاء'} في الانتظار`
    const body  = `${client_name ?? 'عميل جديد'} انضم لطابورك الآن`

    const payload = JSON.stringify({
      title,
      body,
      icon:  '/app-icon-gold.png',
      badge: '/app-icon-gold.png',
      tag:   `queue-${barber_id}`,
      data:  { tab: 'queue', barber_id, queue_count: count },
    })

    // 3. Send to each subscription
    let sent = 0
    for (const sub of subs) {
      if (!sub.subscription_json) continue
      try {
        await sendWebPush(sub.subscription_json, payload)
        sent++
      } catch (e) {
        console.warn('Push failed for one sub:', e.message)
        // If subscription expired/invalid, remove it
        if (e.message?.includes('410') || e.message?.includes('404')) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', barber_id)
            .eq('token', sub.subscription_json.endpoint)
        }
      }
    }

    return json({ sent, total: subs.length })
  } catch (err) {
    console.error('notify-barber-queue error:', err)
    return json({ error: err.message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ── Minimal Web Push sender ───────────────────────────────────
async function sendWebPush(subscription: any, payload: string) {
  const { endpoint, keys } = subscription
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Invalid subscription')
  }

  const jwt    = await makeVapidJwt(endpoint)
  const body   = await encryptPayload(payload, keys.p256dh, keys.auth)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type':     'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL':              '86400',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
}

// ── VAPID JWT ─────────────────────────────────────────────────
async function makeVapidJwt(endpoint: string) {
  const url      = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const exp      = Math.floor(Date.now() / 1000) + 43200

  const header  = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims  = b64url(JSON.stringify({ aud: audience, exp, sub: VAPID_SUBJECT }))
  const input   = `${header}.${claims}`

  const privKey = await crypto.subtle.importKey(
    'pkcs8',
    fromB64url(VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(input)
  )

  return `${input}.${b64urlBuf(sig)}`
}

// ── AES-128-GCM encryption ────────────────────────────────────
async function encryptPayload(plaintext: string, p256dhB64: string, authB64: string) {
  const receiverPub = await crypto.subtle.importKey(
    'raw', fromB64url(p256dhB64),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )

  const local = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  )

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPub }, local.privateKey, 256
  )

  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const auth        = fromB64url(authB64)
  const p256dh      = fromB64url(p256dhB64)
  const salt        = crypto.getRandomValues(new Uint8Array(16))

  // HKDF-SHA-256
  const ikm   = new Uint8Array(sharedBits)
  const prk   = await hkdf(ikm,  auth,  info('auth',    new Uint8Array(0), new Uint8Array(0)), 32)
  const cek   = await hkdf(prk,  salt,  info('aesgcm',  localPubRaw,       p256dh),            16)
  const nonce = await hkdf(prk,  salt,  info('nonce',   localPubRaw,       p256dh),            12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ptBytes = new TextEncoder().encode(plaintext)
  const padded  = new Uint8Array(2 + ptBytes.length) // 2-byte zero padding
  padded.set(ptBytes, 2)

  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, padded
  ))

  // RFC8188 header: salt(16) + rs(4) + idlen(1) + localPub(65) + ciphertext
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)

  return cat(salt, rs, new Uint8Array([65]), localPubRaw, ct)
}

function info(type: string, clientKey: Uint8Array, serverKey: Uint8Array) {
  const t  = new TextEncoder().encode(`Content-Encoding: ${type}\0P-256\0`)
  const l1 = new Uint8Array(2); new DataView(l1.buffer).setUint16(0, clientKey.length)
  const l2 = new Uint8Array(2); new DataView(l2.buffer).setUint16(0, serverKey.length)
  return cat(t, l1, clientKey, l2, serverKey)
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, inf: Uint8Array, len: number) {
  const key  = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: inf }, key, len * 8
  )
  return new Uint8Array(bits)
}

function cat(...arrays: Uint8Array[]) {
  const out = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0))
  let i = 0; for (const a of arrays) { out.set(a, i); i += a.length }
  return out
}

function fromB64url(s: string) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
  return Uint8Array.from(atob(b), c => c.charCodeAt(0))
}

function b64url(s: string) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlBuf(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
