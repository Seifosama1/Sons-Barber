import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'

export default function ClientNotifications({ user, onUnreadChange }) {
  const { t } = useLang()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    onUnreadChange(0)
    fetchNotifications()
  }, [])

  useRealtime('notifications', {}, (payload) => {
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

  if (loading) return (
    <div className="cn-page">
      <div className="empty-state"><div className="app-spinner" style={{ width: 32, height: 32 }} /></div>
    </div>
  )

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

  return (
    <div className={`cn-item ${!n.is_read ? 'unread' : ''} type-${n.type}`}>
      <div className="cn-item-icon">{notifIcon(n.type)}</div>
      <div className="cn-item-body">
        <div className="cn-item-title">{n.title}</div>
        <div className="cn-item-msg">{n.body}</div>

        {isPhoneLink && (
          <div className="cn-action-row">
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

/* ── Inline star rating widget ── */
function RatingWidget({ barberId, notifId, user, t, alreadyRated, onRated }) {
  const [stars, setStars]   = useState(0)
  const [hover, setHover]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(alreadyRated)

  // If parent marks this as rated (e.g. another notification for same barber was submitted), sync state
  useEffect(() => { if (alreadyRated) setDone(true) }, [alreadyRated])

  async function submitRating() {
    if (!stars || done) return
    setSaving(true)
    const { error } = await supabase.from('barber_ratings').insert({
      barber_id:       barberId,
      client_id:       user.id,
      rating:          stars,
      notification_id: notifId,  // links this rating to the specific notification
    })
    setSaving(false)
    if (!error) {
      setDone(true)
      onRated()
    }
  }

  if (done) return (
    <div className="cn-rating-done"><span>{t('ratingDone')}</span></div>
  )

  return (
    <div className="cn-rating-widget">
      <div className="cn-stars">
        {[1,2,3,4,5].map(i => (
          <button key={i} className={`cn-star ${(hover || stars) >= i ? 'lit' : ''}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setStars(i)}>★</button>
        ))}
      </div>
      <button className="cn-rating-submit" onClick={submitRating} disabled={!stars || saving}>
        {saving ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : t('sendRating')}
      </button>
    </div>
  )
}

function notifIcon(type) {
  return {
    booking_approved: '✅',
    booking_rejected: '❌',
    next_in_queue:    '✂️',
    offer:            '🎁',
    rating_request:   '⭐',
    system:           'ℹ️',
    general:          '🔔',
  }[type] || '🔔'
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
