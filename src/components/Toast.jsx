import { useEffect, useState } from 'react'
import '../styles/toast.css'

export default function Toast({
  msg,
  subtitle,
  type = 'success',
  onDone,
  duration = 3200,
  actionText,
  onAction,
  gold = false,
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, duration)
    return () => clearTimeout(t)
  }, [duration, onDone])

  const toastType = gold ? 'gold' : type

  return (
    <div className="toast-container">
      <div className={`toast-card toast-${toastType} ${visible ? 'show' : ''}`}>
        {/* Accent Edge Color Bar */}
        <div className="toast-accent-edge" />

        {/* Content Body: Rounded Badge Icon + Texts */}
        <div className="toast-body">
          <div className="toast-badge-icon">
            {toastType === 'success' ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : toastType === 'error' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              /* Warning / Info / Gold Exclamation Mark */
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>

          <div className="toast-text-wrap">
            <h4 className="toast-title">{msg}</h4>
            {subtitle && <p className="toast-subtitle">{subtitle}</p>}
          </div>
        </div>

        {/* Action Button (e.g. تراجع / عرض / إعادة) */}
        {actionText && (
          <button
            type="button"
            className="toast-action-btn"
            onClick={() => {
              if (onAction) onAction()
              setVisible(false)
              setTimeout(onDone, 200)
            }}
          >
            {actionText}
          </button>
        )}
      </div>
    </div>
  )
}
