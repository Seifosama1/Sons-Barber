import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { useConfirm } from '../context/ConfirmContext'
import Toast from '../components/Toast'
import '../styles/settings.css'

export default function ClientSettings({ user, onBack }) {
  const { logout } = useAuth()
  const { askConfirm } = useConfirm()
  const { t, lang, setLang } = useLang()

  // Theme state (dark enabled as shown in the design)
  const [theme] = useState('dark')

  // Notification toggles — loaded from DB
  const [notifSessionRating, setNotifSessionRating] = useState(true)
  const [notifOffers, setNotifOffers]               = useState(false)
  const [notifQueue, setNotifQueue]                 = useState(true)
  const [loadingPrefs, setLoadingPrefs]             = useState(true)
  const [savingNotif, setSavingNotif]               = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPwd, setUpdatingPwd]         = useState(false)

  // WhatsApp Contact message
  const [contactMsg, setContactMsg] = useState('')

  // Toast notifications
  const [toast, setToast] = useState(null)

  // Target WhatsApp number for clients
  const CLIENT_SUPPORT_PHONE = '01288894721'

  // ── Load notification preferences from DB on mount ──
  useEffect(() => {
    if (!user?.id) return

    async function loadPrefs() {
      setLoadingPrefs(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('notif_session_rating, notif_offers, notif_queue')
        .eq('id', user.id)
        .single()

      if (!error && data) {
        // Use ?? to keep the DB value even when it's false
        setNotifSessionRating(data.notif_session_rating ?? true)
        setNotifOffers(data.notif_offers ?? false)
        setNotifQueue(data.notif_queue ?? true)
      }
      setLoadingPrefs(false)
    }

    loadPrefs()
  }, [user?.id])

  // ── Save a single notification preference to DB ──
  async function saveNotifPref(field, value) {
    if (!user?.id || savingNotif) return
    setSavingNotif(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', user.id)

      if (error) {
        setToast({ msg: t('settingsNotifSaveFailed'), type: 'error' })
        // Revert the toggle on failure
        if (field === 'notif_session_rating') setNotifSessionRating(!value)
        if (field === 'notif_offers')         setNotifOffers(!value)
        if (field === 'notif_queue')          setNotifQueue(!value)
      } else {
        setToast({
          msg: value ? t('settingsNotifEnabled') : t('settingsNotifDisabled'),
          type: value ? 'success' : 'info',
        })
      }
    } catch {
      setToast({ msg: t('settingsNotifSaveFailed'), type: 'error' })
    } finally {
      setSavingNotif(false)
    }
  }

  // Handlers that update state AND persist immediately
  function handleNotifSessionRating(checked) {
    setNotifSessionRating(checked)
    saveNotifPref('notif_session_rating', checked)
  }
  function handleNotifOffers(checked) {
    setNotifOffers(checked)
    saveNotifPref('notif_offers', checked)
  }
  function handleNotifQueue(checked) {
    setNotifQueue(checked)
    saveNotifPref('notif_queue', checked)
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
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setToast({ msg: error.message || t('settingsPassFailed'), type: 'error' })
      } else {
        setToast({ msg: t('settingsPassUpdated'), type: 'success' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setToast({ msg: t('settingsPassFailed'), type: 'error' })
    } finally {
      setUpdatingPwd(false)
    }
  }

  function handleSendWhatsApp(e) {
    e?.preventDefault()
    if (!contactMsg.trim()) return

    let cleanPhone = CLIENT_SUPPORT_PHONE.replace(/[^0-9]/g, '')
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone
    const encoded = encodeURIComponent(contactMsg.trim())
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`
    window.open(url, '_blank')
    setContactMsg('')
  }

  return (
    <div className="cs-page">
      {/* Top Header */}
      <header className="cs-header">
        <h1 className="cs-header-title">{t('settingsTitle')}</h1>
        <button className="cs-back-btn" onClick={onBack} title={t('settingsBack')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </header>

      {/* 1. Theme Section */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
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

      {/* 2. Language Section */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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

      {/* 3. Notifications Section */}
      <section className="cs-section">
        <div className="cs-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>{t('settingsNotifs')}</span>
        </div>

        <div className="cs-card">
          {loadingPrefs ? (
            <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
              {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
            </div>
          ) : (
            <>
              {/* Session Rating */}
              <div className="cs-notif-row">
                <label className="cs-toggle">
                  <input
                    type="checkbox"
                    checked={notifSessionRating}
                    disabled={savingNotif}
                    onChange={(e) => handleNotifSessionRating(e.target.checked)}
                  />
                  <span className="cs-toggle-slider" />
                </label>
                <span className="cs-notif-label">{t('settingsNotifRating')}</span>
              </div>

              {/* Offers */}
              <div className="cs-notif-row">
                <label className="cs-toggle">
                  <input
                    type="checkbox"
                    checked={notifOffers}
                    disabled={savingNotif}
                    onChange={(e) => handleNotifOffers(e.target.checked)}
                  />
                  <span className="cs-toggle-slider" />
                </label>
                <span className="cs-notif-label">{t('settingsNotifOffers')}</span>
              </div>

              {/* Queue */}
              <div className="cs-notif-row">
                <label className="cs-toggle">
                  <input
                    type="checkbox"
                    checked={notifQueue}
                    disabled={savingNotif}
                    onChange={(e) => handleNotifQueue(e.target.checked)}
                  />
                  <span className="cs-toggle-slider" />
                </label>
                <span className="cs-notif-label">{t('settingsNotifQueue')}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 4. Account Section */}
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
                value={currentPassword}
                readOnly
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
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
              />
            </div>

            <button
              type="submit"
              disabled={updatingPwd}
              className="cs-update-pwd-btn"
            >
              {updatingPwd ? t('settingsUpdating') : t('settingsUpdatePassBtn')}
            </button>
          </form>

          <button
            type="button"
            className="cs-logout-btn"
            onClick={async () => {
              const ok = await askConfirm({
                title: t('logout'),
                message: lang === 'en'
                  ? 'Are you sure you want to sign out from your account?'
                  : 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟',
                confirmText: t('logout'),
                cancelText: t('settingsBack'),
                type: 'danger',
              })
              if (ok) logout()
            }}
          >
            {t('logout')}
          </button>
        </div>
      </section>

      {/* 5. Contact Us Section */}
      <section className="cs-section">
        <div className="cs-contact-box">
          <div className="cs-section-header" style={{ fontSize: '1rem', fontWeight: 800 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{t('settingsContactUs')}</span>
          </div>
          <p className="cs-contact-desc">{t('settingsContactDesc')}</p>

          <form onSubmit={handleSendWhatsApp} className="cs-contact-bar">
            <button type="submit" className="cs-contact-send-btn" title={t('settingsContactUs')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <input
              type="text"
              className="cs-contact-input"
              placeholder={t('settingsContactPlaceholder')}
              value={contactMsg}
              onChange={(e) => setContactMsg(e.target.value)}
            />
          </form>
        </div>
      </section>

      <footer className="cs-footer">
        Developed by <strong>Seif Osama</strong>
      </footer>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
