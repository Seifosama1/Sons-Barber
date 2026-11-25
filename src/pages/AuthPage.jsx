import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import PhoneInput from '../components/PhoneInput'
import '../styles/auth.css'

export default function AuthPage() {
  const { login, signup, error, setError } = useAuth()
  const { t } = useLang()
  const [mode, setMode] = useState('login')

  // Login fields
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPass, setShowLoginPass] = useState(false)

  // Signup fields
  const [signupName, setSignupName] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [signupBirthday, setSignupBirthday] = useState('')
  const [showSignupPass, setShowSignupPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)

  const [localError, setLocalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function switchMode(m) {
    setMode(m)
    setError('')
    setLocalError('')
    setSubmitting(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLocalError('')
    if (!loginPhone || !loginPassword) { setLocalError(t('errFillAll')); return }
    setSubmitting(true)
    const ok = await login(loginPhone, loginPassword)
    if (!ok) setSubmitting(false)
  }

  async function handleSignup(e) {
    e.preventDefault()
    setLocalError('')
    if (!signupName.trim())          { setLocalError(t('errEnterName')); return }
    if (!signupPhone)                 { setLocalError(t('errEnterPhone')); return }
    if (!signupBirthday)              { setLocalError(t('errEnterBday')); return }
    if (signupPassword.length < 6)   { setLocalError(t('errMinPass')); return }
    if (signupPassword !== signupConfirm) { setLocalError(t('errPassMatch')); return }
    setSubmitting(true)
    const ok = await signup({ name: signupName.trim(), phone: signupPhone, password: signupPassword, birthday: signupBirthday })
    if (!ok) setSubmitting(false)
  }

  const displayError = localError
    ? t(localError) || localError
    : error
      ? t(error) || error
      : ''

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="bg-circle bg-circle-1" />
        <div className="bg-circle bg-circle-2" />
        <div className="bg-stripes" />
      </div>

      <div className="auth-container">
        {/* Brand */}
        <div className="auth-brand">
          <div className="brand-icon"><ScissorsIcon /></div>
          <h1 className="brand-name">Sons Barber</h1>
          <p className="brand-tagline">{t('brandTagline')}</p>
        </div>

        {/* Card */}
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>
              {t('login')}
            </button>
            <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => switchMode('signup')}>
              {t('signup')}
            </button>
            <div className={`tab-slider ${mode === 'signup' ? 'slide-left' : ''}`} />
          </div>

          {/* Error */}
          {displayError && (
            <div className="auth-error">
              <span className="error-icon">!</span>
              {displayError}
            </div>
          )}

          {mode === 'login' && (
            <form className="auth-form" onSubmit={handleLogin} noValidate>
              <div className="field-group">
                <label className="field-label">{t('phone')}</label>
                <PhoneInput value={loginPhone} onChange={setLoginPhone} />
              </div>
              <div className="field-group">
                <label className="field-label">{t('password')}</label>
                <div className="password-wrapper">
                  <input className="field-input" type={showLoginPass ? 'text' : 'password'}
                    placeholder={t('enterPassword')} value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" className="eye-btn" onClick={() => setShowLoginPass(v => !v)} tabIndex={-1}>
                    {showLoginPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <button className="auth-submit" type="submit" disabled={submitting}>
                {submitting ? <span className="btn-spinner" /> : t('loginBtn')}
              </button>
              <p className="auth-switch-hint">
                {t('noAccount')}{' '}
                <button type="button" className="link-btn" onClick={() => switchMode('signup')}>
                  {t('registerNow')}
                </button>
              </p>
            </form>
          )}

          {mode === 'signup' && (
            <form className="auth-form" onSubmit={handleSignup} noValidate>
              <div className="field-group">
                <label className="field-label">{t('fullName')}</label>
                <input className="field-input" type="text" placeholder={t('enterName')}
                  value={signupName} onChange={e => setSignupName(e.target.value)} autoComplete="name" />
              </div>
              <div className="field-group">
                <label className="field-label">{t('phone')}</label>
                <PhoneInput value={signupPhone} onChange={setSignupPhone} />
              </div>
              <div className="field-group">
                <label className="field-label">{t('birthday')}</label>
                <div className="date-wrapper">
                  <input className="field-input date-input" type="date" value={signupBirthday}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setSignupBirthday(e.target.value)} />
                  <span className="date-icon"><CalendarIcon /></span>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">{t('password')}</label>
                <div className="password-wrapper">
                  <input className="field-input" type={showSignupPass ? 'text' : 'password'}
                    placeholder={t('minPassword')} value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)} autoComplete="new-password" />
                  <button type="button" className="eye-btn" onClick={() => setShowSignupPass(v => !v)} tabIndex={-1}>
                    {showSignupPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {signupPassword && <PasswordStrength password={signupPassword} t={t} />}
              </div>
              <div className="field-group">
                <label className="field-label">{t('confirmPassword')}</label>
                <div className="password-wrapper">
                  <input
                    className={`field-input ${signupConfirm && signupPassword !== signupConfirm ? 'input-error' : signupConfirm && signupPassword === signupConfirm ? 'input-success' : ''}`}
                    type={showConfirmPass ? 'text' : 'password'}
                    placeholder={t('repeatPassword')} value={signupConfirm}
                    onChange={e => setSignupConfirm(e.target.value)} autoComplete="new-password" />
                  <button type="button" className="eye-btn" onClick={() => setShowConfirmPass(v => !v)} tabIndex={-1}>
                    {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <button className="auth-submit" type="submit" disabled={submitting}>
                {submitting ? <span className="btn-spinner" /> : t('signupBtn')}
              </button>
              <p className="auth-switch-hint">
                {t('hasAccount')}{' '}
                <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                  {t('loginLink')}
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="auth-footer">{t('footer')}</p>
      </div>
    </div>
  )
}

/* ── Password strength ── */
function PasswordStrength({ password, t }) {
  const strength = getStrength(password)
  const labels = ['', t('passWeak'), t('passMed'), t('passStrong'), t('passGreat')]
  const colors = ['', '#e74c3c', '#f39c12', '#2ecc71', '#27ae60']
  return (
    <div className="strength-wrapper">
      <div className="strength-bars">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="strength-bar" style={{ background: i <= strength ? colors[strength] : '#2a2a2a' }} />
        ))}
      </div>
      <span className="strength-label" style={{ color: colors[strength] }}>{labels[strength]}</span>
    </div>
  )
}
function getStrength(pw) {
  let s = 0
  if (pw.length >= 6) s++
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw) || /[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(s, 4)
}

/* ── Icons ── */
function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
