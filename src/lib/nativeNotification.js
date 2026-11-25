/**
 * Native Notification Service
 * Handles system-level native notifications:
 * 1. Web Notification API (when running in browser / PWA)
 * 2. Capacitor Push / Local Notifications (when compiled to Android APK)
 */

// Request system notification permission
export async function requestNotificationPermission() {
  try {
    // 1. If running under Capacitor native runtime (APK)
    if (window.Capacitor?.isNativePlatform()) {
      if (window.Capacitor.Plugins?.PushNotifications) {
        const perm = await window.Capacitor.Plugins.PushNotifications.requestPermissions()
        if (perm.receive === 'granted') {
          await window.Capacitor.Plugins.PushNotifications.register()
          return 'granted'
        }
      }
      if (window.Capacitor.Plugins?.LocalNotifications) {
        const perm = await window.Capacitor.Plugins.LocalNotifications.requestPermissions()
        return perm.display === 'granted' ? 'granted' : 'denied'
      }
    }

    // 2. Standard Web & PWA Notification API
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        const status = await Notification.requestPermission()
        return status
      }
      return Notification.permission
    }
  } catch (err) {
    console.warn('Could not request notification permission:', err)
  }
  return 'denied'
}

// Audio chime helper for immediate feedback
function playNotificationChime() {
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

// Trigger a system-level native notification
export async function showNativeNotification({ title, body, icon = '/app-icon-gold.png', tag = 'sons-barber' }) {
  // Always trigger sound & vibration
  playNotificationChime()
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200]) } catch {}
  }

  try {
    // 1. If running under Capacitor native runtime (APK)
    if (window.Capacitor?.isNativePlatform()) {
      if (window.Capacitor.Plugins?.LocalNotifications) {
        await window.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 100000),
              schedule: { at: new Date(Date.now() + 100) },
              sound: 'default',
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#C9A84C'
            }
          ]
        })
        return
      }
    }

    // 2. Standard Web / PWA Notification API
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        // If service worker registration is available, use showNotification for mobile support
        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.getRegistration()
            if (reg && reg.showNotification) {
              await reg.showNotification(title, {
                body,
                icon,
                badge: icon,
                tag,
                vibrate: [200, 100, 200]
              })
              return
            }
          } catch {}
        }

        // Fallback to desktop / standard window Notification
        new Notification(title, {
          body,
          icon,
          tag
        })
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
