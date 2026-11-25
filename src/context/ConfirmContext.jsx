import { createContext, useContext, useState, useCallback } from 'react'
import '../styles/confirm.css'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null) // { title, message, confirmText, cancelText, type, onConfirm, onCancel }

  const askConfirm = useCallback(({
    title = 'تأكيد الإجراء',
    message = 'هل أنت متأكد من المتابعة؟',
    confirmText = 'نعم، تأكيد',
    cancelText = 'إلغاء',
    type = 'danger', // 'danger' | 'warning' | 'primary'
  }) => {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        confirmText,
        cancelText,
        type,
        onConfirm: () => {
          setDialog(null)
          resolve(true)
        },
        onCancel: () => {
          setDialog(null)
          resolve(false)
        },
      })
    })
  }, [])

  return (
    <ConfirmContext.Provider value={{ askConfirm }}>
      {children}
      {dialog && (
        <div className="confirm-modal-overlay" onClick={dialog.onCancel}>
          <div className="confirm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className={`confirm-icon-wrap ${dialog.type}`}>
              {dialog.type === 'danger' ? (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              ) : dialog.type === 'warning' ? (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
              )}
            </div>

            <h3 className="confirm-title">{dialog.title}</h3>
            <p className="confirm-message">{dialog.message}</p>

            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn cancel"
                onClick={dialog.onCancel}
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className={`confirm-btn ${dialog.type === 'danger' ? 'confirm-danger' : 'confirm-gold'}`}
                onClick={dialog.onConfirm}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}
