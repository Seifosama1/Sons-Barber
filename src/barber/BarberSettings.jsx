import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import '../styles/settings.css'

export default function BarberSettings({ user, onBack }) {
  const { logout } = useAuth()
  const { t, lang, setLang } = useLang()

  // Theme state
  const [theme] = useState('dark')

  // Notification toggle (1 toggle for queue joins)
  const [notifQueueJoin, setNotifQueueJoin] = useState(() => {
    return localStorage.getItem(`barber_notif_queue_${user?.id}`) !== 'false'
  })

  // Privacy toggle (Hide live queue count from clients)
  const [hideQueueCount, setHideQueueCount] = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPwd, setUpdatingPwd] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)

  // Load barber privacy setting
  useEffect(() => {
    if (!user?.id) return
    const stored = localStorage.getItem(`barber_hide_queue_${user.id}`)
    setHideQueueCount(stored === 'true')
  }, [user?.id])

  function handleToggleQueueNotif(val) {
    setNotifQueueJoin(val)
    localStorage.setItem(`barber_notif_queue_${user?.id}`, val.toString())
  }

  async function handleToggleHideQueueCount(val) {
    setHideQueueCount(val)
    localStorage.setItem(`barber_hide_queue_${user?.id}`, val.toString())
    setToast({ msg: val ? (t('settingsBarberHideQueueCount') + ': ' + t('settingsActiveNow')) : t('settingsPassUpdated'), type: 'success' })
  }

  async function handleUpdatePassword(e) {
    e?.preventDefault()
    if (!newPassword || !confirmPassword) {
      setToast({ msg: t('settingsPassRequired'), type: 'error' })
      return
    }
    if (newPassword.length < 6) {
      setToast({ msg: t('settingsPassMin'), type: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      setToast({ msg: t('settingsPassMismatch'), type: 'error' })
      return
    }

    setUpdatingPwd(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        setToast({ msg: error.message || t('settingsPassFailed'), type: 'error' })
      } else {
        setToast({ msg: t('settingsPassUpdated'), type: 'success' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setToast({ msg: t('settingsPassFailed'), type: 'error' })
    } finally {
      setUpdatingPwd(false)
    }
  }

  return (
    <div className="cs-page">
      {/* Header */}
      <header className="cs-header">
        <h1 className="cs-header-title">{t('settingsTitle')}</h1>
        <button
          type="button"
          className="cs-back-btn"
          onClick={onBack}
          title={t('settingsBack')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </header>

      {/* 1. Theme Section (المظهر) */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span>{t('settingsTheme')}</span>
        </div>

        <div className="cs-card">
          <div className="cs-theme-row">
            <div className="cs-theme-switch">
              <button
                type="button"
                className="cs-theme-icon-btn"
                title={t('settingsLightSoon')}
                onClick={() => setToast({ msg: t('settingsLightSoon'), type: 'info' })}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                </svg>
              </button>

              <button
                type="button"
                className={`cs-theme-icon-btn ${theme === 'dark' ? 'active' : ''}`}
                title={t('settingsDarkMode')}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </button>
            </div>

            <div className="cs-theme-info">
              <span className="cs-theme-title">{t('settingsDarkMode')}</span>
              <span className="cs-theme-sub">{t('settingsActiveNow')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Language Section (اللغة) */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>{t('settingsLang')}</span>
        </div>

        <div className="cs-lang-card">
          <button
            type="button"
            className={`cs-lang-pill ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en', user?.id)}
          >
            English
          </button>
          <button
            type="button"
            className={`cs-lang-pill ${lang === 'ar' ? 'active' : ''}`}
            onClick={() => setLang('ar', user?.id)}
          >
            العربية
          </button>
        </div>
      </section>

      {/* 3. Notification Toggle (إشعار انضمام عميل للطابور المباشر) */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>{t('settingsNotifs')}</span>
        </div>

        <div className="cs-card">
          <div className="cs-notif-row">
            <label className="cs-toggle">
              <input
                type="checkbox"
                checked={notifQueueJoin}
                onChange={(e) => handleToggleQueueNotif(e.target.checked)}
              />
              <span className="cs-toggle-slider" />
            </label>
            <span className="cs-notif-label">{t('settingsBarberQueueNotif')}</span>
          </div>
        </div>
      </section>

      {/* 4. Privacy Toggle (إخفاء عدد عملاء طابوري عن الزبائن) */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{lang === 'en' ? 'Queue Privacy' : 'خصوصية الطابور'}</span>
        </div>

        <div className="cs-card">
          <div className="cs-notif-row" style={{ alignItems: 'flex-start' }}>
            <label className="cs-toggle" style={{ marginTop: '2px' }}>
              <input
                type="checkbox"
                checked={hideQueueCount}
                disabled={savingPrivacy}
                onChange={(e) => handleToggleHideQueueCount(e.target.checked)}
              />
              <span className="cs-toggle-slider" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span className="cs-notif-label">{t('settingsBarberHideQueueCount')}</span>
              <span style={{ fontSize: '0.74rem', color: '#888', lineHeight: '1.4' }}>
                {t('settingsBarberHideQueueDesc')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Password Update Section (الحساب وكلمة المرور) */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>{t('settingsAccount')}</span>
        </div>

        <div className="cs-card">
          <div className="cs-account-title">{t('settingsChangePass')}</div>

          <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div className="cs-input-group">
              <label className="cs-input-label">{t('settingsCurrentPass')}</label>
              <input
                type="password"
                className="cs-input"
                placeholder="••••••••"
                value="••••••••"
                readOnly
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed', background: '#181818' }}
                autoComplete="current-password"
              />
            </div>

            <div className="cs-input-group">
              <label className="cs-input-label">{t('settingsNewPass')}</label>
              <input
                type="password"
                className="cs-input"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="cs-input-group">
              <label className="cs-input-label">{t('settingsConfirmPass')}</label>
              <input
                type="password"
                className="cs-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={updatingPwd}
              className="cs-update-pwd-btn"
            >
              {updatingPwd ? (
                <>
                  <span className="btn-spinner" style={{ width: 14, height: 14 }} />
                  {t('settingsUpdating')}
                </>
              ) : (
                t('settingsUpdatePassBtn')
              )}
            </button>
          </form>
        </div>
      </section>

      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  )
}
