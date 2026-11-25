import { useState, useEffect } from 'react'
import { useLang } from '../context/LanguageContext'
import '../styles/offline.css'

export default function NoInternetModal() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [retrying, setRetrying] = useState(false)
  const { t, lang } = useLang()

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
    }
    function handleOffline() {
      setIsOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function handleRetry() {
    setRetrying(true)
    setTimeout(() => {
      if (navigator.onLine) {
        setIsOffline(false)
      }
      setRetrying(false)
    }, 800)
  }

  function handleOfflineMode() {
    setIsOffline(false)
  }

  if (!isOffline) return null

  return (
    <div className="no-internet-screen" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="no-internet-content">
        {/* Golden Wifi Slash Icon */}
        <div className="no-internet-icon-wrap">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Diagonal slash line */}
            <line x1="2" y1="2" x2="22" y2="22" stroke="#c9a84c" strokeWidth="2.2" />
            {/* Wifi arcs (clipped by slash) */}
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" stroke="#c9a84c" strokeWidth="2.2" />
            <path d="M1.42 9a15.92 15.92 0 0 1 4.7-2.88" stroke="#c9a84c" strokeWidth="2.2" />
            <path d="M6.52 12.9A10.94 10.94 0 0 1 12 11c1.73 0 3.36.41 4.8 1.14" stroke="#c9a84c" strokeWidth="2.2" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" stroke="#c9a84c" strokeWidth="2.2" />
            <line x1="12" y1="20" x2="12.01" y2="20" stroke="#c9a84c" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="no-internet-title">{t('noInternetTitle')}</h2>

        {/* Description */}
        <p className="no-internet-desc">{t('noInternetDesc')}</p>

        {/* Buttons */}
        <div className="no-internet-actions">
          <button
            type="button"
            className="no-internet-btn retry"
            onClick={handleRetry}
            disabled={retrying}
          >
            <svg
              className={`no-internet-retry-icon${retrying ? ' spinning' : ''}`}
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.86" />
            </svg>
            {retrying ? t('noInternetRetrying') : t('noInternetRetry')}
          </button>

          <button
            type="button"
            className="no-internet-btn offline"
            onClick={handleOfflineMode}
          >
            {t('noInternetOffline')}
          </button>
        </div>
      </div>
    </div>
  )
}
