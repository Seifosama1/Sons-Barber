/**
 * Push notification helpers for barbers (Web Push / PWA)
 */
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY  = import.meta.env.VITE_VAPID_PUBLIC_KEY
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Register this device for push notifications.
 * Call once when a barber logs in.
 * Returns { ok: true } on success, { ok: false, reason } on failure.
 */
export async function registerBarberPush(userId) {
  if (!userId) return { ok: false, reason: 'no_user' }
  if (!VAPID_PUBLIC_KEY) {
    console.info('[push] VITE_VAPID_PUBLIC_KEY not set — skipping push registration')
    return { ok: false, reason: 'no_vapid_key' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'not_supported' }
  }

  try {
    // 1. Request permission (won't re-ask if already granted/denied)
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: 'permission_denied' }

    // 2. Wait for the service worker
    const reg = await navigator.serviceWorker.ready

    // 3. Subscribe (idempotent — returns existing if already subscribed)
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // 4. Save to Supabase
    const subJson = sub.toJSON()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:           userId,
          device_type:       'web',
          token:             sub.endpoint,
          subscription_json: subJson,
          updated_at:        new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      )

    if (error) {
      console.warn('[push] Failed to save subscription:', error.message)
      return { ok: false, reason: error.message }
    }

    console.info('[push] ✅ Registered for barber:', userId)
    return { ok: true }
  } catch (err) {
    console.warn('[push] Registration error:', err.message)
    return { ok: false, reason: err.message }
  }
}

/**
 * Call this after a client successfully joins a barber's queue.
 * Triggers the Edge Function to send a push to the barber.
 */
export async function notifyBarberQueueJoin({ barberId, clientName, queueCount }) {
  if (!barberId) return

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-barber-queue`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        barber_id:   barberId,
        client_name: clientName,
        queue_count: queueCount,
      }),
    })
  } catch (err) {
    // Non-blocking — don't break the queue join if push fails
    console.warn('[push] notifyBarberQueueJoin failed:', err.message)
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/**
 * Send a push notification to a client via the Edge Function.
 * Call this after inserting a notification row for the client.
 * @param {{ clientId: string, title: string, body: string, tag?: string }}
 */
export async function notifyClientPush({ clientId, title, body, tag }) {
  if (!clientId || !title) return

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ client_id: clientId, title, body, tag }),
    })
  } catch (err) {
    console.warn('[push] notifyClientPush failed:', err.message)
  }
}
