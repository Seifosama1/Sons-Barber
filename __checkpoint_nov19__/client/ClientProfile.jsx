import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

export default function ClientProfile({ user }) {
  const { logout } = useAuth()
  const { t, lang, setLang } = useLang()
  const [copied, setCopied] = useState(false)
  const [toast, setToast]   = useState(null)

  function copyCode() {
    navigator.clipboard.writeText(user.client_code || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const initial = user?.name?.trim()[0]?.toUpperCase() || '?'

  return (
    <div className="cp-page">
      <div className="cp-topbar">
        <span className="cp-topbar-title">{t('profileTitle')}</span>
      </div>

      <div className="cp-hero">
        <div className="cp-avatar">{initial}</div>
        <div className="cp-name">{user?.name}</div>
        <div className="cp-phone">{user?.phone}</div>
      </div>

      <div className="cp-code-card">
        <div className="cp-code-label">{t('clientCode')}</div>
        <div className="cp-code-row">
          <span className="cp-code">{user?.client_code || '------'}</span>
          <button className="cp-copy-btn" onClick={copyCode}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
        <div className="cp-code-hint">{t('codeHint')}</div>
      </div>

      <div className="cp-stats-row">
        <div className="cp-stat">
          <span className="cp-stat-val">{user?.total_cuts || 0}</span>
          <span className="cp-stat-label">{t('totalCuts')}</span>
        </div>
        <div className="cp-stat">
          <span className="cp-stat-val">{user?.loyalty_cuts || 0}/10</span>
          <span className="cp-stat-label">{t('loyaltyProgress')}</span>
        </div>
      </div>

      {/* Language switcher */}
      <div className="cp-lang-row">
        <span className="cp-lang-label">{t('language')}</span>
        <div className="cp-lang-btns">
          <button
            className={`cp-lang-btn ${lang === 'ar' ? 'active' : ''}`}
            onClick={() => setLang('ar', user?.id)}
          >🇸🇦 ع</button>
          <button
            className={`cp-lang-btn ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en', user?.id)}
          >🇺🇸 EN</button>
        </div>
      </div>

      <button className="cp-logout-btn" onClick={logout}>{t('logout')}</button>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

function CopyIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="20 6 9 17 4 12"/></svg> }
