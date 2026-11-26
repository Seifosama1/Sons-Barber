import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { serviceUpload } from '../lib/storageUpload'
import { serviceUpdate } from '../lib/serviceDb'
import Toast from '../components/Toast'
import { ClientProfileSkeleton } from '../components/ClientSkeletons'

export default function ClientProfile({ user, onOpenSettings }) {
  const { t } = useLang()
  const [copied, setCopied]   = useState(false)
  const [toast, setToast]     = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || user?.avatarUrl || null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarFileRef = useRef(null)

  useEffect(() => {
    if (user?.avatar_url || user?.avatarUrl) {
      setAvatarUrl(user.avatar_url || user.avatarUrl)
    }
  }, [user?.avatar_url, user?.avatarUrl])

  if (!user?.id) return <ClientProfileSkeleton />

  function copyCode() {
    navigator.clipboard.writeText(user.client_code || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)

    const ext = file.name.split('.').pop()
    const path = `avatars/client-${user.id}-${Date.now()}.${ext}`

    const { publicUrl, error: upErr } = await serviceUpload('barber-media', path, file)

    if (upErr) {
      setToast({ msg: 'فشل رفع الصورة: ' + upErr, type: 'error' })
      setUploadingAvatar(false)
      return
    }

    await serviceUpdate('profiles', { avatar_url: publicUrl }, 'id', user.id)
    setAvatarUrl(publicUrl)
    setUploadingAvatar(false)
    setShowAvatarModal(false)
    setToast({ msg: 'تم تحديث الصورة الشخصية بنجاح', type: 'success' })
  }

  async function handleDeleteAvatar() {
    await serviceUpdate('profiles', { avatar_url: null }, 'id', user.id)
    setAvatarUrl(null)
    setShowAvatarModal(false)
    setToast({ msg: 'تم حذف الصورة الشخصية', type: 'success' })
  }

  const initial = user?.name?.trim()[0]?.toUpperCase() || '?'

  return (
    <div className="cp-page">
      <div className="cp-topbar">
        <span className="cp-topbar-title">{t('profileTitle')}</span>
        {onOpenSettings && (
          <button
            className="cp-settings-btn"
            onClick={onOpenSettings}
            title="الإعدادات"
            style={{
              background: '#161616',
              border: '1px solid #282828',
              borderRadius: '50%',
              width: 38,
              height: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--gold, #c9a84c)',
              transition: 'all 0.2s',
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      <div className="cp-hero">
        <div className="bp-avatar-wrap">
          <div className="cp-avatar" style={{ overflow: 'hidden' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
          <button
            className="bp-avatar-add-btn"
            onClick={() => avatarFileRef.current?.click()}
            title="تغيير الصورة"
          >
            +
          </button>
          <input
            type="file"
            ref={avatarFileRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleAvatarChange}
          />
        </div>
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

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

function CopyIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="20 6 9 17 4 12"/></svg> }
