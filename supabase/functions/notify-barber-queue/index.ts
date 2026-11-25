// Supabase Edge Function: notify-barber-queue
// Triggered by DB trigger (or called directly) when a client joins a barber's waitlist.
// Sends a Web Push notification to all of the barber's registered devices.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@sonsbarber.app'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  // Allow CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const body = await req.json()
    const { barber_id, client_id, entry_id, walk_in_name } = body

    if (!barber_id) {
      return new Response(JSON.stringify({ error: 'barber_id required' }), { status: 400 })
    }

    // 1. Get the barber's name
    const { data: barberProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', barber_id)
      .single()

    // 2. Count total waiting in this barber's queue
    const { count: queueCount } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', barber_id)
      .eq('status', 'waiting')

    // 3. Get client name if app client
    let clientName = walk_in_name || 'عميل جديد'
    if (client_id) {
      const { data: clientProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', client_id)
        .single()
      if (clientProfile?.name) clientName = clientProfile.name
    }

    // 4. Build notification payload
    const totalWaiting = queueCount || 1
    const notifTitle = `طابورك — ${totalWaiting} ${totalWaiting === 1 ? 'عميل' : 'عملاء'} في الانتظار`
    const notifBody = `${clientName} انضم لطابورك الآن`

    const pushPayload = JSON.stringify({
      title: notifTitle,
      body: notifBody,
      icon: '/app-icon-gold.png',
      badge: '/app-icon-gold.png',
      tag: `queue-${barber_id}`,
      data: {
        url: '/barber',
        tab: 'queue',
        barber_id,
        queue_count: totalWaiting,
      },
    })

    // 5. Fetch all push subscriptions for this barber
    const { data: subscriptions, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', barber_id)

    if (subErr || !subscriptions?.length) {
      console.log('No push subscriptions found for barber:', barber_id)
      return new Response(JSON.stringify({ sent: 0, reason: 'no_subscriptions' }), { status: 200 })
    }

    // 6. Send Web Push to each subscription
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        if (!sub.subscription_json) return null

        const subscription = sub.subscription_json
        await sendWebPush(subscription, pushPayload)
      })
    )

    const sent = results.filter(r => r.status === 'fulfilled').length

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, queue_count: totalWaiting }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('notify-barber-queue error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ── Web Push using VAPID ──────────────────────────────────────
async function sendWebPush(subscription: any, payload: string) {
  const { endpoint, keys } = subscription
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Invalid subscription object')
  }

  // Build VAPID JWT
  const vapidHeaders = await buildVapidHeaders(endpoint, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: await encryptPayload(payload, keys.p256dh, keys.auth),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Push failed ${res.status}: ${text}`)
  }
}

// ── VAPID JWT builder ─────────────────────────────────────────
async function buildVapidHeaders(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600

  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const claims = btoa(JSON.stringify({ aud: audience, exp: expiry, sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${header}.${claims}`

  // Import private key
  const privKeyBytes = base64UrlDecode(privateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signatureBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${signature}`

  return {
    'Authorization': `vapid t=${jwt},k=${publicKey}`,
  }
}

// ── AES-128-GCM payload encryption ───────────────────────────
async function encryptPayload(payload: string, p256dhBase64: string, authBase64: string): Promise<ArrayBuffer> {
  const p256dh = base64UrlDecode(p256dhBase64)
  const auth = base64UrlDecode(authBase64)

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // Import receiver public key
  const receiverKey = await crypto.subtle.importKey(
    'raw',
    p256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverKey },
    localKeyPair.privateKey,
    256
  )

  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey('raw', localKeyPair.publicKey)

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF for content encryption key and nonce
  const prk = await hkdf(new Uint8Array(sharedBits), auth, buildInfo('auth', new Uint8Array(0), new Uint8Array(0)), 32)
  const contentKey = await hkdf(prk, salt, buildInfo('aesgcm', new Uint8Array(localPublicKey), p256dh), 16)
  const nonce = await hkdf(prk, salt, buildInfo('nonce', new Uint8Array(localPublicKey), p256dh), 12)

  // Encrypt
  const cryptoKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const payloadBytes = new TextEncoder().encode(payload)
  const paddedPayload = new Uint8Array(2 + payloadBytes.length)
  paddedPayload.set([0, 0]) // 2-byte padding length
  paddedPayload.set(payloadBytes, 2)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    paddedPayload
  )

  // Build the final body: salt(16) + rs(4) + keyid_len(1) + local_pub_key(65) + ciphertext
  const rs = new ArrayBuffer(4)
  new DataView(rs).setUint32(0, 4096, false)
  const keyIdLen = new Uint8Array([65])
  const result = concat(salt, new Uint8Array(rs), keyIdLen, new Uint8Array(localPublicKey), new Uint8Array(ciphertext))
  return result.buffer
}

function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(`Content-Encoding: ${type}\0P-256\0`)
  const len1 = new Uint8Array(2); new DataView(len1.buffer).setUint16(0, clientKey.length)
  const len2 = new Uint8Array(2); new DataView(len2.buffer).setUint16(0, serverKey.length)
  return concat(typeBytes, len1, clientKey, len2, serverKey)
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial,
    length * 8
  )
  return new Uint8Array(bits)
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}
