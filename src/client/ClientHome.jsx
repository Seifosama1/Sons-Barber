import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'
import BookingSheet from './BookingSheet'
import Toast from '../components/Toast'
import { ClientHomeSkeleton } from '../components/ClientSkeletons'

export default function ClientHome({ user, onNavigateTab }) {
  const { t, lang } = useLang()
  const [shopSettings, setShopSettings] = useState({ is_open: true, open_time: '09:00', close_time: '22:00' })
  const [services, setServices] = useState([])
  const [barbers, setBarbers] = useState([])
  const [recentSessions, setRecentSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBooking, setShowBooking] = useState(false)
  const [toast, setToast] = useState(null)
  const [showAllSessions, setShowAllSessions] = useState(false)

  // Carousel refs for auto-moving services strip and scrollable barbers strip
  const servicesStripRef = useRef(null)
  const barbersStripRef = useRef(null)
  const [canScrollBarbersLeft, setCanScrollBarbersLeft] = useState(false)
  const [canScrollBarbersRight, setCanScrollBarbersRight] = useState(false)

  // Auto-scrolling services slideshow
  useEffect(() => {
    const el = servicesStripRef.current
    if (!el || services.length <= 1) return

    let animationId
    let isPaused = false
    let pauseTimeout = null

    const handleUserInteraction = () => {
      isPaused = true
      clearTimeout(pauseTimeout)
      pauseTimeout = setTimeout(() => {
        isPaused = false
      }, 2400)
    }

    const events = ['touchstart', 'touchmove', 'pointerdown', 'wheel', 'mouseenter']
    events.forEach(evt => el.addEventListener(evt, handleUserInteraction, { passive: true }))

    let lastTime = performance.now()
    const speed = 0.45 // pixels per frame

    function step(currentTime) {
      const delta = currentTime - lastTime
      lastTime = currentTime

      if (!isPaused && el) {
        // Handle both RTL and LTR scroll
        const maxScroll = el.scrollWidth - el.clientWidth
        if (maxScroll > 0) {
          if (lang === 'ar') {
            // For RTL in standard browsers, scrollLeft can be negative or positive depending on engine
            // scrollBy smooth increment
            if (Math.abs(el.scrollLeft) >= maxScroll - 1) {
              el.scrollLeft = 0
            } else {
              el.scrollLeft += (lang === 'ar' ? -1 : 1) * speed
            }
          } else {
            if (el.scrollLeft >= maxScroll - 1) {
              el.scrollLeft = 0
            } else {
              el.scrollLeft += speed
            }
          }
        }
      }
      animationId = requestAnimationFrame(step)
    }

    animationId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animationId)
      clearTimeout(pauseTimeout)
      events.forEach(evt => el.removeEventListener(evt, handleUserInteraction))
    }
  }, [services.length, lang])

  // Barbers scroll arrows state check
  const checkBarbersScroll = useCallback(() => {
    const el = barbersStripRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 4) {
      setCanScrollBarbersLeft(false)
      setCanScrollBarbersRight(false)
      return
    }
    const currentScroll = Math.abs(el.scrollLeft)
    setCanScrollBarbersLeft(currentScroll > 5)
    setCanScrollBarbersRight(currentScroll < maxScroll - 5)
  }, [])

  useEffect(() => {
    checkBarbersScroll()
    const el = barbersStripRef.current
    if (!el) return
    el.addEventListener('scroll', checkBarbersScroll, { passive: true })
    window.addEventListener('resize', checkBarbersScroll)
    return () => {
      el.removeEventListener('scroll', checkBarbersScroll)
      window.removeEventListener('resize', checkBarbersScroll)
    }
  }, [barbers.length, checkBarbersScroll])

  const scrollBarbers = (direction) => {
    const el = barbersStripRef.current
    if (!el) return
    const scrollAmount = 180
    // Adjust for RTL direction
    const multiplier = lang === 'ar' ? (direction === 'left' ? 1 : -1) : (direction === 'left' ? -1 : 1)
    el.scrollBy({ left: scrollAmount * multiplier, behavior: 'smooth' })
  }

  // Debounce ref — prevents multiple simultaneous refetches
  const refetchTimer = useRef(null)
  const debouncedFetch = useCallback(() => {
    clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      fetchRecentSessions()
      fetchServices()
      fetchBarbers()
    }, 400)
  }, [])

  useEffect(() => {
    Promise.all([
      fetchShopSettings(),
      fetchServices(),
      fetchBarbers(),
      fetchRecentSessions()
    ]).finally(() => {
      setLoading(false)
    })
    return () => clearTimeout(refetchTimer.current)
  }, [])

  // Live Realtime Subscriptions
  useRealtime('shop_settings', {}, (payload) => {
    if (payload.new) setShopSettings({
      is_open: payload.new.is_open,
      open_time: payload.new.open_time?.slice(0,5) || '09:00',
      close_time: payload.new.close_time?.slice(0,5) || '22:00',
    })
  })
  useRealtime('appointments', {}, debouncedFetch)
  useRealtime('services',     {}, debouncedFetch)
  useRealtime('transactions', {}, debouncedFetch)
  useRealtime('profiles',     {}, debouncedFetch)

  async function fetchShopSettings() {
    const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).single()
    if (data) setShopSettings({
      is_open: data.is_open,
      open_time: data.open_time?.slice(0,5) || '09:00',
      close_time: data.close_time?.slice(0,5) || '22:00',
    })
  }

  async function fetchServices() {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, duration, discount_pct, is_active')
      .eq('is_active', true)
      .order('price', { ascending: true })
    if (data) setServices(data)
  }

  async function fetchBarbers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, is_active, on_seat_client_id')
      .eq('role', 'barber')
      .order('name')
    if (data) setBarbers(data)
  }

  async function fetchRecentSessions() {
    // 1. Fetch appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, scheduled_at, created_at, status, barber:barber_id(id, name), services(name, price, discount_pct)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 2. Fetch transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('id, barber_id, service_name, price_charged, original_price, discount_pct, created_at, barber:barber_id(name)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 3. Match transactions to appointments
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

    const apptSessions = apptList.map(a => ({
      ...a,
      _paid: paidApptIds.has(a.id),
      _type: 'appointment',
      created_at: a.created_at
    }))

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

    const all = [...apptSessions, ...txnSessions]
      .sort((a, b) => new Date(b.created_at || b.scheduled_at) - new Date(a.created_at || a.scheduled_at))
      .slice(0, 10)

    setRecentSessions(all)
  }

  const firstName = user?.name?.split(' ')[0] || (lang === 'ar' ? 'عزيزنا' : 'Friend')
  const loyaltyCuts   = user?.loyalty_cuts || 0
  const loyaltyTarget = 10
  const loyaltyProgress = (loyaltyCuts / loyaltyTarget) * 100

  const visibleSessions = showAllSessions ? recentSessions : recentSessions.slice(0, 1)

  const specialOffersCount = services.filter(s => s.discount_pct > 0).length
  const freeBarbersCount = barbers.filter(b => b.is_active && !b.on_seat_client_id).length

  function statusLabel(s, paid) {
    if (paid) return t('statusPaid') || (lang === 'ar' ? 'تم الدفع' : 'Paid')
    return t('status' + s.charAt(0).toUpperCase() + s.slice(1)) || s
  }

  if (loading) return <ClientHomeSkeleton />

  return (
    <div className="ch-page">
      {/* ── 1. Top Header: Greeting + Shop Status Pill ── */}
      <header className="ch-head">
        <div className="ch-greeting">
          <div className="ch-greeting-hi">
            {t('greeting')} <br /><span>{firstName}</span>
          </div>
          <div className="ch-greeting-sub">{t('greetingSub')}</div>
        </div>

        <div className="ch-head-status">
          <div className={`ch-status-pill ${shopSettings.is_open ? 'open' : 'closed'}`}>
            <span className={`ch-status-dot-pulse ${shopSettings.is_open ? 'open' : 'closed'}`} />
            {shopSettings.is_open ? t('shopOpen') : t('shopClosed')}
          </div>
          <span className="ch-head-hours">
            {shopSettings.open_time} &ndash; {shopSettings.close_time}
          </span>
        </div>
      </header>

      {/* ── 2. Action Buttons: Book Appointment + Join Waitlist Side by Side ── */}
      <div className="ch-actions-grid">
        <button className="ch-action-btn book" onClick={() => setShowBooking(true)}>
          <CalendarIcon />
          <span>{t('bookNow')}</span>
        </button>

        <button
          className="ch-action-btn waitlist"
          onClick={() => onNavigateTab ? onNavigateTab('waitlist') : null}
        >
          <QueueIconSm />
          <span>{t('joinLiveWaitlist')}</span>
        </button>
      </div>

      {/* ── 3. Services and Offers Strip ── */}
      {services.length > 0 && (
        <section>
          <div className="ch-sec-hdr">
            <small>
              {specialOffersCount > 0
                ? (lang === 'ar' ? `${specialOffersCount} عروض خاصة` : `${specialOffersCount} special offers`)
                : (lang === 'ar' ? 'الخدمات المتاحة' : 'Available services')}
            </small>
            <h3>{lang === 'ar' ? 'الخدمات والعروض' : 'Services and Offers'}</h3>
          </div>

          <div
            ref={servicesStripRef}
            className="ch-services-strip"
            role="group"
            aria-label="Services and offers"
          >
            {services.map(svc => {
              const hasDeal = svc.discount_pct > 0
              const finalPrice = hasDeal
                ? Math.round(svc.price * (1 - svc.discount_pct / 100))
                : svc.price

              return (
                <div
                  key={svc.id}
                  className={`ch-svc-card ${hasDeal ? 'has-deal' : ''}`}
                  onClick={() => setShowBooking(true)}
                  title={svc.name}
                >
                  {hasDeal && (
                    <span className="ch-svc-flag">
                      <TagIcon />
                      {svc.discount_pct}% {lang === 'ar' ? 'خصم' : 'off'}
                    </span>
                  )}
                  <div className="ch-svc-top-icon">
                    <ScissorsIconSm />
                  </div>
                  <b className="ch-svc-name">{svc.name}</b>
                  <span className="ch-svc-duration">
                    {svc.duration || 30} {lang === 'ar' ? 'دقيقة' : 'min'}
                  </span>
                  <div className="ch-svc-price-wrap">
                    {hasDeal && <s className="ch-svc-old-price">{svc.price}</s>}
                    <span>{finalPrice} {lang === 'ar' ? 'ج' : 'EGP'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 4. Available Barbers (View Only with Arrow Controls) ── */}
      {barbers.length > 0 && (
        <section>
          <div className="ch-sec-hdr">
            <div className="ch-sec-hdr-left">
              <small>
                {freeBarbersCount > 0
                  ? (lang === 'ar' ? `${freeBarbersCount} متاحين الآن` : `${freeBarbersCount} free now`)
                  : (lang === 'ar' ? 'طاقم الحلاقين' : 'Barbers team')}
              </small>
              <div className="ch-carousel-arrows">
                <button
                  type="button"
                  className="ch-arrow-btn"
                  onClick={() => scrollBarbers('right')}
                  aria-label="السابق"
                  title="السابق"
                >
                  <ChevronRightIcon />
                </button>
                <button
                  type="button"
                  className="ch-arrow-btn"
                  onClick={() => scrollBarbers('left')}
                  aria-label="التالي"
                  title="التالي"
                >
                  <ChevronLeftIcon />
                </button>
              </div>
            </div>
            <h3>{lang === 'ar' ? 'الحلاقون المتاحون' : 'Available Barbers'}</h3>
          </div>

          <div
            ref={barbersStripRef}
            className="ch-barbers-grid scrollable"
            role="group"
            aria-label="Available Barbers"
          >
            {barbers.map(barber => {
              const isOff = !barber.is_active
              const isBusy = barber.is_active && !!barber.on_seat_client_id

              const statusText = isOff
                ? (lang === 'ar' ? 'غير متاح' : 'Off today')
                : isBusy
                ? (lang === 'ar' ? 'مشغول' : 'Busy')
                : (lang === 'ar' ? 'متاح الآن' : 'Free now')

              return (
                <div
                  key={barber.id}
                  className={`ch-barber-chip ${isBusy ? 'busy' : ''} ${isOff ? 'off' : ''}`}
                >
                  <div className="ch-barber-av">
                    {barber.avatar_url ? (
                      <img src={barber.avatar_url} alt={barber.name} />
                    ) : (
                      <span>{barber.name?.[0] || 'B'}</span>
                    )}
                    <span className="ch-barber-av-dot" />
                  </div>
                  <b className="ch-barber-name">{barber.name}</b>
                  <span className="ch-barber-status">{statusText}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 5. Loyalty Card (Same Functionality) ── */}
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
            {Array.from({ length: loyaltyTarget }, (_, i) => (
              <div
                key={i}
                className={`ch-loyalty-tick ${i < loyaltyCuts ? 'done' : ''}`}
                style={{ left: `${(i / loyaltyTarget) * 100}%` }}
              >
                {i < loyaltyCuts ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : ''}
              </div>
            ))}
          </div>
          <div className="ch-loyalty-counts">
            <span>{t('loyaltyCuts', { done: loyaltyCuts, total: loyaltyTarget })}</span>
            <span>{t('loyaltyLeft', { n: loyaltyTarget - loyaltyCuts })}</span>
          </div>
        </div>
      </div>

      {/* ── 6. Recent Sessions (Updated Modern Design) ── */}
      {recentSessions.length > 0 && (
        <section className="ch-recent">
          <div className="ch-recent-header">
            <h3>{t('recentSessions')}</h3>
            {recentSessions.length > 1 && (
              <button
                className="ch-recent-toggle-btn"
                onClick={() => setShowAllSessions(v => !v)}
              >
                {showAllSessions ? t('showLess') : t('showAll', { n: recentSessions.length })}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleSessions.map(s => {
              const svc = s.services
              const hasDiscount = svc?.discount_pct > 0
              const finalPrice = hasDiscount
                ? Math.round(svc.price * (1 - svc.discount_pct / 100))
                : svc?.price
              const displayStatus = s._paid ? 'paid' : s.status
              const label = statusLabel(s.status, s._paid)

              return (
                <div key={s.id} className="ch-sess-card">
                  <div className="ch-sess-left">
                    <p className="ch-sess-title">{svc?.name || t('service')}</p>
                    <p className="ch-sess-meta">
                      {t('with')} {s.barber?.name || t('barber')} &middot; {formatDate(s.scheduled_at)}
                    </p>
                    <span className={`ch-sess-tag ${displayStatus}`}>{label}</span>
                  </div>

                  <div className="ch-sess-right">
                    {svc?.price && (
                      <p className="ch-sess-price">
                        {finalPrice} {lang === 'ar' ? 'ج' : 'EGP'}
                        {hasDiscount && <s>{svc.price}</s>}
                      </p>
                    )}
                    {hasDiscount && (
                      <span className="ch-sess-disc-badge">
                        {svc.discount_pct}% {lang === 'ar' ? 'خصم' : 'off'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Booking Sheet Modal */}
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function QueueIconSm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function ScissorsIconSm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}
