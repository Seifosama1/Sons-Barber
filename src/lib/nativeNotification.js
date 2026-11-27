import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase, supabaseAdmin } from './supabase'

/**
 * Native Notification & Push Service for Sons Barber
 * 1. Capacitor PushNotifications (FCM) on Android / Native
 * 2. Saves/syncs FCM registration token in user_metadata & profiles
 * 3. Handles foreground and background push notification events
 * 4. Web Notification API fallback for browsers / PWA
 */

export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await PushNotifications.requestPermissions()
      return perm.receive === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'denied'
    }
  }
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      return await Notification.requestPermission()
    }
    return Notification.permission
  }
  return 'denied'
}

export async function initPushNotifications(userId) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not a native platform, skipping Capacitor push init.')
    return
  }

  try {
    // 1. Request notification permissions from device
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions()
    }

    if (perm.receive !== 'granted') {
      console.warn('[Push] Push notification permission not granted:', perm.receive)
      return
    }

    // Also register local notification channels for Android 8.0+
    if (Capacitor.isPluginAvailable('LocalNotifications')) {
      await LocalNotifications.createChannel({
        id: 'sons_barber_default',
        name: 'Sons Barber Notifications',
        description: 'Appointments, waitlist & promotions updates',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
      }).catch(() => {})
    }

    // 2. Register with FCM
    await PushNotifications.register()

    // 3. Listen for FCM Token
    PushNotifications.removeAllListeners()

    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] FCM Registration token acquired:', token.value)
      if (userId && token.value) {
        await saveDeviceToken(userId, token.value)
      }
    })

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] FCM Registration Error:', error)
    })

    // 4. Foreground push notification received
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[Push] Foreground notification received:', notification)
      playNotificationChime()
      if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]) } catch {}
      }

      // Show local notification banner when app is active in foreground
      if (Capacitor.isPluginAvailable('LocalNotifications')) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: notification.title || 'Sons Barber',
              body: notification.body || '',
              id: Math.floor(Math.random() * 100000),
              channelId: 'sons_barber_default',
              schedule: { at: new Date(Date.now() + 100) },
              sound: 'default',
              smallIcon: 'ic_launcher',
              iconColor: '#C9A84C'
            }
          ]
        }).catch(err => console.warn('Could not display local notification:', err))
      }
    })

    // 5. User tapped on a push notification (works from background or closed state)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Push] Notification action performed:', action)
      const data = action.notification?.data
      if (data?.url) {
        window.location.href = data.url
      }
    })

  } catch (err) {
    console.warn('[Push] Push notifications setup error:', err)
  }
}

// Save FCM token for the user so backend can target this device
export async function saveDeviceToken(userId, token) {
  try {
    // 1. Try auth.admin updateUserById via supabaseAdmin
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userData?.user) {
      const existingTokens = userData.user.user_metadata?.fcm_tokens || []
      if (!existingTokens.includes(token)) {
        const updatedTokens = [...existingTokens, token]
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...userData.user.user_metadata,
            fcm_tokens: updatedTokens
          }
        })
        console.log('[Push] FCM token saved to user_metadata successfully.')
      }
    }
  } catch (err) {
    console.warn('[Push] Error saving FCM token:', err)
  }
}

// Audio chime helper for immediate feedback
export function playNotificationChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1) // A5
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.3)
  } catch {}
}

// System-level notification trigger (foreground / in-app fallback)
export async function showNativeNotification({ title, body, icon = '/icons/icon-192.png', tag = 'sons-barber' }) {
  playNotificationChime()
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200]) } catch {}
  }

  try {
    if (Capacitor.isNativePlatform()) {
      if (Capacitor.isPluginAvailable('LocalNotifications')) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 100000),
              channelId: 'sons_barber_default',
              schedule: { at: new Date(Date.now() + 100) },
              sound: 'default',
              smallIcon: 'ic_launcher',
              iconColor: '#C9A84C'
            }
          ]
        })
        return
      }
    }

    // Web Notification fallback
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.getRegistration()
            if (reg?.showNotification) {
              await reg.showNotification(title, { body, icon, badge: icon, tag, vibrate: [200, 100, 200] })
              return
            }
          } catch {}
        }
        new Notification(title, { body, icon, tag })
      } else if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') {
          new Notification(title, { body, icon, tag })
        }
      }
    }
  } catch (err) {
    console.warn('Native notification display failed:', err)
  }
}
