/**
 * usePushNotifications
 * Registers the barber's browser/PWA for Web Push notifications
 * and stores the subscription in Supabase push_subscriptions table.
 *
 * Works when the app is open AND when closed (via service worker).
 */

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Call this once when a barber logs in.
 * Requests permission, subscribes to push, and saves to DB.
 */
export async function registerBarberPush(userId) {
  if (!userId) return { error: 'no user id' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { error: 'Push not supported in this browser' }
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not set — push notifications disabled')
    return { error: 'VAPID key missing' }
  }

  try {
    // 1. Request notification permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { error: 'Permission denied' }
    }

    // 2. Get the active service worker registration
    const registration = await navigator.serviceWorker.ready

    // 3. Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // 4. Save subscription to Supabase
    const subJson = subscription.toJSON()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          device_type: 'web',
          token: subscription.endpoint,
          subscription_json: subJson,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      )

    if (error) {
      console.error('Failed to save push subscription:', error)
      return { error: error.message }
    }

    console.log('✅ Push subscription registered for barber:', userId)
    return { subscription }
  } catch (err) {
    console.error('Push registration error:', err)
    return { error: err.message }
  }
}

/**
 * Unsubscribes this device from push and removes from DB.
 */
export async function unregisterBarberPush(userId) {
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('token', subscription.endpoint)
      await subscription.unsubscribe()
    }
  } catch (err) {
    console.error('Push unregister error:', err)
  }
}

/**
 * Converts a base64url VAPID public key to Uint8Array
 * required by pushManager.subscribe()
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}
