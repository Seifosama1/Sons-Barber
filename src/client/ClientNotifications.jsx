import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'
import { ClientNotificationsSkeleton } from '../components/ClientSkeletons'

export default function ClientNotifications({ user, onUnreadChange }) {
  const { t } = useLang()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    onUnreadChange(0)
    fetchNotifications()
  }, [])

  useRealtime('notifications', user?.id ? { filter: `target_user_id=eq.${user.id}` } : {}, (payload) => {
    if (payload.eventType === 'INSERT' && payload.new?.target_user_id === user.id) {
      setNotifications(prev => [payload.new, ...prev])
      supabase.from('notifications').update({ is_read: true }).eq('id', payload.new.id)
    }
    if (payload.eventType === 'UPDATE' && payload.new) {
      setNotifications(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n))
    }
  })

  async function fetchNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('target_user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(50)
    const list = data || []

    // Check which notification IDs have already been rated
    const ratingNotifIds = list
      .filter(n => n.type === 'rating_request')
      .map(n => n.id)

    let ratedNotifIds = new Set()
    if (ratingNotifIds.length > 0) {
      const { data: existingRatings } = await supabase
        .from('barber_ratings')
        .select('notification_id')
        .eq('client_id', user.id)
        .in('notification_id', ratingNotifIds)
      ratedNotifIds = new Set((existingRatings || []).map(r => r.notification_id))
    }

    // Mark each rating_request notification as _rated if its notification_id was submitted
    const enriched = list.map(n =>
      n.type === 'rating_request' && ratedNotifIds.has(n.id)
        ? { ...n, _rated: true }
        : n
    )

    setNotifications(enriched)
    setLoading(false)
    const unreadIds = list.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    }
  }

  function markRated(notifId) {
    // Mark only this specific notification as rated
    setNotifications(prev => prev.map(n =>
      n.id === notifId ? { ...n, _rated: true } : n
    ))
  }

  if (loading) return <ClientNotificationsSkeleton />

  return (
    <div className="cn-page">
      <div className="cn-header">
        <h2 className="cn-title">{t('notifsTitle')}</h2>
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <BellIconLg />
          <p>{t('noNotifs')}</p>
          <p style={{ fontSize: '0.75rem', color: '#444' }}>{t('noNotifsSub')}</p>
        </div>
      ) : (
        <div className="cn-list">
          {notifications.map(n => (
            <NotifItem key={n.id} n={n} user={user} t={t} onRated={() => markRated(n.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function NotifItem({ n, user, t, onRated }) {
  const isRatingReq = n.type === 'rating_request'
  const isPhoneLink = n.action_url && !isRatingReq && n.type === 'booking_rejected'

  function getWhatsAppUrl(phone) {
    if (!phone) return ''
    let clean = phone.replace(/[^0-9]/g, '')
    if (clean.startsWith('01')) clean = '2' + clean
    const msg = encodeURIComponent(`مرحباً، بخصوص رفض طلب الحجز الخاص بي في صالون Sons Barber.`)
    return `https://wa.me/${clean}?text=${msg}`
  }

  return (
    <div className={`cn-item ${!n.is_read ? 'unread' : ''} type-${n.type}`}>
      <div className="cn-item-icon">{notifIcon(n.type)}</div>
      <div className="cn-item-body">
        <div className="cn-item-title">{n.title}</div>
        <div className="cn-item-msg">{n.body}</div>

        {isPhoneLink && (
          <div className="cn-action-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <a
              href={getWhatsAppUrl(n.action_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="cn-whatsapp-btn"
            >
              <WhatsAppIcon /> {t('whatsappAdmin')}
            </a>
            <a href={`tel:${n.action_url}`} className="cn-call-btn">
              {t('callUs')} {n.action_url}
            </a>
            <button className="cn-copy-btn" onClick={() => navigator.clipboard.writeText(n.action_url)}>
              <CopyIcon /> {t('copyBtn')}
            </button>
          </div>
        )}

        {isRatingReq && (
          <RatingWidget
            barberId={n.action_url}
            notifId={n.id}
            user={user}
            t={t}
            alreadyRated={!!n._rated}
            onRated={onRated}
          />
        )}

        <div className="cn-item-time">{formatTime(n.sent_at)}</div>
      </div>
    </div>
  )
}

/* ── Inline star rating widget with optional comment ── */
function RatingWidget({ barberId, notifId, user, t, alreadyRated, onRated }) {
  const [isOpen, setIsOpen]   = useState(false)
  const [stars, setStars]     = useState(0)
  const [hover, setHover]     = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(alreadyRated)

  // If parent marks this as rated, sync state
  useEffect(() => { if (alreadyRated) setDone(true) }, [alreadyRated])

  async function submitRating() {
    if (!stars || done) return
    setSaving(true)

    const payload = {
      barber_id:       barberId,
      client_id:       user.id,
      rating:          stars,
      notification_id: notifId,
    }
    if (comment.trim()) {
      payload.comment = comment.trim()
    }

    const { error } = await supabase.from('barber_ratings').insert(payload)
    setSaving(false)
    if (!error) {
      setDone(true)
      onRated()
    } else {
      console.warn('Rating submission error:', error)
      // If error was due to comment column not added yet in supabase, fallback to insert without comment
      if (payload.comment && error.message?.includes('comment')) {
        delete payload.comment
        const { error: retryErr } = await supabase.from('barber_ratings').insert(payload)
        if (!retryErr) {
          setDone(true)
          onRated()
        }
      }
    }
  }

  if (done) return (
    <div className="cn-rating-done"><span>{t('ratingDone')}</span></div>
  )

  if (!isOpen) {
    return (
      <div style={{ marginTop: '8px' }}>
        <button
          className="cn-rate-btn"
          onClick={() => setIsOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.45rem 0.95rem',
            background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: '800',
            cursor: 'pointer'
          }}
        >
          ★ {t('rateBarber') || 'تقييم الحلاق'}
        </button>
      </div>
    )
  }

  return (
    <div className="cn-rating-widget">
      <div className="cn-stars">
        {[1,2,3,4,5].map(i => (
          <button key={i} className={`cn-star ${(hover || stars) >= i ? 'lit' : ''}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setStars(i)}>★</button>
        ))}
      </div>

      {stars > 0 && (
        <textarea
          className="cn-rating-comment-input"
          placeholder={t('ratingCommentPlaceholder')}
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          maxLength={300}
        />
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button className="cn-rating-submit" onClick={submitRating} disabled={!stars || saving}>
          {saving ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : t('sendRating')}
        </button>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '0.78rem',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
        >
          {t('cancel') || 'إلغاء'}
        </button>
      </div>
    </div>
  )
}

function notifIcon(type) {
  const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { width: 18, height: 18 } }
  switch (type) {
    case 'booking_approved':
      return (
        <svg {...iconProps} stroke="#2ecc71">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    case 'booking_rejected':
      return (
        <svg {...iconProps} stroke="#e74c3c">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )
    case 'next_in_queue':
      return (
        <svg {...iconProps} stroke="var(--gold)">
          <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
        </svg>
      )
    case 'offer':
      return (
        <svg {...iconProps} stroke="var(--gold)">
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      )
    case 'rating_request':
      return (
        <svg {...iconProps} fill="var(--gold)" stroke="var(--gold)">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )
    case 'system':
      return (
        <svg {...iconProps} stroke="#3498db">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
    default:
      return (
        <svg {...iconProps} stroke="var(--gold)">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
  }
}

function formatTime(iso) {
  if (!iso) return ''
  const d   = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000)     return 'الآن'
  if (diff < 3600000)   return `${Math.floor(diff / 60000)} دقيقة`
  if (diff < 86400000)  return `${Math.floor(diff / 3600000)} ساعة`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} يوم`
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function BellIconLg() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, opacity: 0.2 }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function PhoneIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, flexShrink: 0 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.74a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> }
function CopyIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, flexShrink: 0 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM9.05 7.61C8.89 7.61 8.64 7.67 8.42 7.91C8.2 8.15 7.58 8.73 7.58 9.91C7.58 11.09 8.44 12.23 8.56 12.39C8.68 12.55 10.23 15.09 12.69 16.05C14.74 16.85 15.16 16.69 15.61 16.65C16.06 16.61 17.06 16.06 17.26 15.48C17.47 14.9 17.47 14.41 17.41 14.31C17.35 14.21 17.18 14.15 16.94 14.03C16.69 13.9 15.47 13.3 15.24 13.22C15.02 13.14 14.86 13.1 14.69 13.34C14.53 13.58 14.06 14.15 13.91 14.31C13.77 14.48 13.63 14.5 13.38 14.37C13.14 14.25 12.35 13.99 11.42 13.16C10.7 12.51 10.21 11.71 10.07 11.47C9.93 11.23 10.05 11.09 10.18 10.97C10.29 10.86 10.42 10.68 10.55 10.54C10.67 10.4 10.71 10.3 10.79 10.14C10.87 9.97 10.83 9.83 10.77 9.71C10.71 9.59 10.21 8.37 10.01 7.87C9.81 7.39 9.61 7.45 9.46 7.45C9.32 7.44 9.16 7.44 9.05 7.61Z"/>
    </svg>
  )
}
