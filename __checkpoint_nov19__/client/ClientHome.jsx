import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'
import BookingSheet from './BookingSheet'
import Toast from '../components/Toast'

export default function ClientHome({ user }) {
  const { t, ta } = useLang()
  const [shopSettings, setShopSettings] = useState({ is_open: true, open_time: '09:00', close_time: '22:00' })
  const [recentSessions, setRecentSessions] = useState([])
  const [showBooking, setShowBooking] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchShopSettings()
    fetchRecentSessions()
  }, [])

  useRealtime('shop_settings', {}, (payload) => {
    if (payload.new) setShopSettings({
      is_open: payload.new.is_open,
      open_time: payload.new.open_time?.slice(0,5) || '09:00',
      close_time: payload.new.close_time?.slice(0,5) || '22:00',
    })
  })

  // Live appointment status updates
  useRealtime('appointments', {}, () => { fetchRecentSessions() })

  // Live service discount updates — refresh session prices when admin changes a discount
  useRealtime('services', {}, () => { fetchRecentSessions() })

  // Live transactions — when admin does checkout, session flips to "تم ✓"
  useRealtime('transactions', {}, () => { fetchRecentSessions() })
  async function fetchShopSettings() {
    const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).single()
    if (data) setShopSettings({
      is_open: data.is_open,
      open_time: data.open_time?.slice(0,5) || '09:00',
      close_time: data.close_time?.slice(0,5) || '22:00',
    })
  }

  async function fetchRecentSessions() {
    // 1. Fetch appointments — ordered by created_at (when booking was made)
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, scheduled_at, created_at, status, barber:barber_id(id, name), services(name, price, discount_pct)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 2. Fetch transactions (paid sessions — may or may not have an appointment)
    const { data: txns } = await supabase
      .from('transactions')
      .select('id, barber_id, service_name, price_charged, original_price, discount_pct, created_at, barber:barber_id(name)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 3. Match transactions to appointments (one-to-one, by barber, txn after appt date)
    const usedTxnIds = new Set()
    const paidApptIds = new Set()
    const apptList = appts || []

    for (const appt of apptList) {
      if (appt.status !== 'confirmed') continue
      const matchTxn = (txns || []).find(t =>
        !usedTxnIds.has(t.id) &&
        t.barber_id === appt.barber?.id &&
        new Date(t.created_at) >= new Date(appt.scheduled_at)
      )
      if (matchTxn) {
        usedTxnIds.add(matchTxn.id)
        paidApptIds.add(appt.id)
      }
    }

    // 4. Build sessions list: appointments + unmatched transactions as standalone entries
    const apptSessions = apptList.map(a => ({ ...a, _paid: paidApptIds.has(a.id), _type: 'appointment', created_at: a.created_at }))

    const txnSessions = (txns || [])
      .filter(t => !usedTxnIds.has(t.id))
      .map(t => ({
        id:           t.id,
        scheduled_at: t.created_at,
        created_at:   t.created_at,
        status:       'confirmed',
        _paid:        true,
        _type:        'transaction',
        barber:       t.barber,
        services: {
          name:         t.service_name,
          price:        t.original_price,
          discount_pct: t.discount_pct || 0,
        },
      }))

    // Sort by created_at desc — most recently added record first
    const all = [...apptSessions, ...txnSessions]
      .sort((a, b) => new Date(b.created_at || b.scheduled_at) - new Date(a.created_at || a.scheduled_at))
      .slice(0, 10)

    setRecentSessions(all)
  }

  const firstName = user?.name?.split(' ')[0] || (t('greeting').includes('Hello') ? 'Friend' : 'عزيزنا')
  const loyaltyCuts   = user?.loyalty_cuts || 0
  const loyaltyTarget = 10
  const loyaltyProgress = (loyaltyCuts / loyaltyTarget) * 100

  const [showAllSessions, setShowAllSessions] = useState(false)
  const visibleSessions = showAllSessions ? recentSessions : recentSessions.slice(0, 1)

  function statusLabel(s, paid) {
    if (paid) return t('statusPaid')
    return t('status' + s.charAt(0).toUpperCase() + s.slice(1)) || s
  }

  return (
    <div className="ch-page">
      {/* Greeting */}
      <div className="ch-greeting">
        <div className="ch-greeting-hi">{t('greeting')} <span>{firstName}</span> {greetEmoji()}</div>
        <div className="ch-greeting-sub">{t('greetingSub')}</div>
      </div>

      {/* Shop status card */}
      <div className={`ch-shop-card ${shopSettings.is_open ? 'open' : 'closed'}`}>
        <div className="ch-shop-left">
          <span className={`ch-status-dot ${shopSettings.is_open ? 'open' : 'closed'}`} />
          <div>
            <div className="ch-shop-status">{shopSettings.is_open ? t('shopOpen') : t('shopClosed')}</div>
            <div className="ch-shop-hours">
              {shopSettings.is_open
                ? t('shopHoursOpen', { open: shopSettings.open_time, close: shopSettings.close_time })
                : t('shopSoon')}
            </div>
          </div>
        </div>
        <ScissorsIconSm />
      </div>

      {/* Book now button */}
      <button className="ch-book-btn" onClick={() => setShowBooking(true)}>
        <CalendarIcon /> {t('bookNow')}
      </button>

      {/* Loyalty card */}
      <div className="ch-loyalty-card">
        <div className="ch-loyalty-top">
          <div>
            <div className="ch-loyalty-title">{t('loyaltyTitle')}</div>
            <div className="ch-loyalty-sub">{t('loyaltySub')}</div>
          </div>
          <div className="ch-loyalty-code-block">
            <div className="ch-loyalty-code-label">{t('loyaltyCode')}</div>
            <div className="ch-loyalty-code">{user?.client_code || '------'}</div>
          </div>
        </div>
        <div className="ch-loyalty-progress">
          <div className="ch-loyalty-bar">
            <div className="ch-loyalty-fill" style={{ width: `${loyaltyProgress}%` }} />
            {Array.from({ length: loyaltyTarget }, (_, i) => {
              return (
                <div
                  key={i}
                  className={`ch-loyalty-tick ${i < loyaltyCuts ? 'done' : ''}`}
                  style={{ left: `${(i / loyaltyTarget) * 100}%` }}
                >
                  {i < loyaltyCuts ? '✓' : ''}
                </div>
              )
            })}
          </div>
          <div className="ch-loyalty-counts">
            <span>{t('loyaltyCuts', { done: loyaltyCuts, total: loyaltyTarget })}</span>
            <span>{t('loyaltyLeft', { n: loyaltyTarget - loyaltyCuts })}</span>
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="ch-recent">
          <div className="ch-section-title">{t('recentSessions')}</div>
          {visibleSessions.map(s => {
            const svc = s.services
            const hasDiscount = svc?.discount_pct > 0
            const finalPrice = hasDiscount
              ? Math.round(svc.price * (1 - svc.discount_pct / 100))
              : svc?.price
            const displayStatus = s._paid ? 'paid' : s.status
            const label = statusLabel(s.status, s._paid)
            return (
            <div key={s.id} className="ch-session-row">
              <div className="ch-session-info">
                <span className="ch-session-service">{svc?.name || t('service')}</span>
                <span className="ch-session-barber">{t('with')} {s.barber?.name || t('barber')}</span>
                {svc?.price && (
                  <span className="ch-session-price">
                    {hasDiscount && <span className="ch-session-old-price">{svc.price} ج</span>}
                    <span className={hasDiscount ? 'ch-session-new-price' : 'ch-session-std-price'}>
                      {finalPrice} ج
                    </span>
                    {hasDiscount && <span className="ch-session-disc-badge">-{svc.discount_pct}%</span>}
                  </span>
                )}
              </div>
              <div className="ch-session-right">
                <span className={`ch-session-status ${displayStatus}`}>{label}</span>
                <span className="ch-session-date">{formatDate(s.scheduled_at)}</span>
              </div>
            </div>
            )
          })}
          {recentSessions.length > 1 && (
            <button className="ch-show-more-btn" onClick={() => setShowAllSessions(v => !v)}>
              {showAllSessions ? t('showLess') : t('showAll', { n: recentSessions.length })}
            </button>
          )}
        </div>
      )}

      {showBooking && (
        <BookingSheet
          user={user}
          onClose={() => setShowBooking(false)}
          onBooked={() => {
            setShowBooking(false)
            fetchRecentSessions()
            setToast({ msg: t('bookingSuccess'), type: 'success' })
          }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`
}
function greetEmoji() {
  const h = new Date().getHours()
  if (h < 12) return '☀️'
  if (h < 17) return '👋'
  return '🌙'
}
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function ScissorsIconSm() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:36,height:36,opacity:0.25}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
