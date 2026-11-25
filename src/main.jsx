import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/perf.css'   // ← performance overrides (loaded last wins specificity)

// Detect low-end mobile hardware (e.g. Galaxy A20 with <= 2GB RAM)
function detectLowEndDevice() {
  try {
    const memory = navigator.deviceMemory // RAM in GB (available on Chromium Android)
    const cores = navigator.hardwareConcurrency // CPU thread count
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

    // ONLY apply to mobile devices with very low RAM or limited cores — never touch desktop/PC!
    const isLowEnd = isMobile && (
      (memory !== undefined && memory <= 2) ||
      (cores !== undefined && cores <= 4 && memory !== undefined && memory <= 3)
    )

    if (isLowEnd) {
      document.documentElement.classList.add('low-end')
    } else {
      document.documentElement.classList.remove('low-end')
    }
  } catch (e) {
    console.warn('Device detection error:', e)
  }
}
detectLowEndDevice()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA service worker — registered automatically by vite-plugin-pwa (autoUpdate)
// Manual registration kept as fallback for plain /sw.js (push notifications)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.error('[SW] Failed:', err))
  })
}
