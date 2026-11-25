import { useLang } from '../context/LanguageContext'
import '../styles/langpicker.css'

export default function LanguagePicker({ onDone }) {
  const { setLang } = useLang()

  function pick(lang) {
    setLang(lang)
    onDone()
  }

  return (
    <div className="lp-root">
      <div className="lp-bg">
        <div className="lp-circle lp-circle-1" />
        <div className="lp-circle lp-circle-2" />
      </div>

      <div className="lp-content">
        {/* Logo */}
        <div className="lp-brand">
          <div className="lp-logo"><ScissorsIcon /></div>
          <h1 className="lp-name">Sons Barber</h1>
        </div>

        <div className="lp-card">
          <p className="lp-title">🌐 Choose Your Language</p>
          <p className="lp-sub">اختر لغتك</p>

          <div className="lp-options">
            <button className="lp-option" onClick={() => pick('ar')}>
              <div className="lp-option-info">
                <span className="lp-option-name">العربية</span>
                <span className="lp-option-sub">Arabic</span>
              </div>
              <span className="lp-arrow">←</span>
            </button>

            <button className="lp-option" onClick={() => pick('en')}>
              <div className="lp-option-info">
                <span className="lp-option-name">English</span>
                <span className="lp-option-sub">الإنجليزية</span>
              </div>
              <span className="lp-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

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
