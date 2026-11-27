import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Register Service Worker with instant auto-update mechanism ONLY in web browsers, never in native APK
const isNativeApp = window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:'

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Force checking for sw.js updates every time page opens
      reg.update()

      // Handle worker updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage('SKIP_WAITING')
            }
          })
        }
      })
    }).catch((err) => {
      console.warn('Service worker registration failed:', err)
    })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
