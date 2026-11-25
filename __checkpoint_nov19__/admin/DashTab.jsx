import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import ServicesSection from './ServicesSection'

const DAYS_AR   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const MONTHS_AR = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function getWeekDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d
  })
}
function formatHour(h) {
  if (h === 0)   return '12 ص'
  if (h < 12)   return `${h} ص`
  if (h === 12) return '12 م'
  return `${h - 12} م`
}

export default function DashTab({ user }) {
  const [showHoursEditor, setShowHoursEditor] = useState(false)
  const [showAllRequests, setShowAllRequests] = useState(false)
  const [detailReq, setDetailReq]             = useState(null)

  const [weekDays]       = useState(getWeekDays)
  const [selectedDay, setSelectedDay]     = useState(weekDays[0])
  const [barbers, setBarbers]             = useState([])
  const [selectedBarber, setSelectedBarber] = useState(null)
  const [appointments, setAppointments]   = useState([])
  const [stats, setStats]                 = useState({ today: 0, week: 0, clients: 0, pending: 0 })

  // Shop settings
  const [shopSettings, setShopSettings]   = useState({ is_open: true, open_time: '09:00', close_time: '22:00' })
  const [savingHours, setSavingHours]     = useState(false)

  // Reservation requests
  const [requests, setRequests]           = useState([])
  const [loadingReq, setLoadingReq]       = useState(true)

  useEffect(() => {
    fetchBarbers()
    fetchStats()
    fetchShopSettings()
    fetchRequests()
  }, [])

  useEffect(() => {
    if (selectedBarber) fetchAppointments()
  }, [selectedDay, selectedBarber])

  // ── Realtime subscriptions ──
  // 1. New/updated appointment → refresh requests list + stats
  useRealtime('appointments', {}, (payload) => {
    fetchRequests()
    fetchStats()
    if (selectedBarber) fetchAppointments()
  })

  // 2. Shop settings changed from another device → sync immediately
  useRealtime('shop_settings', {}, (payload) => {
    if (payload.new) {
      setShopSettings({
        is_open:    payload.new.is_open,
        open_time:  payload.new.open_time?.slice(0,5)  || '09:00',
        close_time: payload.new.close_time?.slice(0,5) || '22:00',
      })
    }
  })

  // 3. New barber added → refresh barber list
  useRealtime('profiles', { filter: 'role=eq.barber' }, () => {
    fetchBarbers()
  })

  /* ── Fetchers ── */
  async function fetchBarbers() {
    const { data } = await supabase.from('profiles').select('id, name').eq('role', 'barber').order('created_at')
    if (data?.length) { setBarbers(data); setSelectedBarber(data[0]) }
  }

  async function fetchAppointments() {
    const start = new Date(selectedDay); start.setHours(0,0,0,0)
    const end   = new Date(selectedDay); end.setHours(23,59,59,999)
    const { data } = await supabase
      .from('appointments')
      .select('id, scheduled_at, status, client:client_id(name), services(name)')
      .eq('barber_id', selectedBarber.id)
      .in('status', ['confirmed','completed'])
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
    setAppointments(data || [])
  }

  async function fetchStats() {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999)
    const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const [todayRes, weekRes, clientsRes, pendingRes] = await Promise.all([
      supabase.from('appointments').select('id',{count:'exact',head:true}).gte('scheduled_at',todayStart.toISOString()).lte('scheduled_at',todayEnd.toISOString()),
      supabase.from('appointments').select('id',{count:'exact',head:true}).gte('scheduled_at',weekStart.toISOString()),
      supabase.from('profiles').select('id',{count:'exact',head:true}).eq('role','client'),
      supabase.from('appointments').select('id',{count:'exact',head:true}).eq('status','pending'),
    ])
    setStats({ today: todayRes.count||0, week: weekRes.count||0, clients: clientsRes.count||0, pending: pendingRes.count||0 })
  }

  async function fetchShopSettings() {
    const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).single()
    if (data) setShopSettings({ is_open: data.is_open, open_time: data.open_time?.slice(0,5) || '09:00', close_time: data.close_time?.slice(0,5) || '22:00' })
  }

  async function fetchRequests() {
    setLoadingReq(true)
    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, status, instapay_image_url, deposit_amount, notes, client:client_id(id, name, phone), services(name), barber:barber_id(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoadingReq(false)
  }

  /* ── Actions ── */
  async function toggleShopOpen() {
    const newVal = !shopSettings.is_open
    setShopSettings(s => ({ ...s, is_open: newVal }))
    await supabase.from('shop_settings').update({ is_open: newVal, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  async function saveHours() {
    setSavingHours(true)
    await supabase.from('shop_settings').update({
      open_time: shopSettings.open_time,
      close_time: shopSettings.close_time,
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    setSavingHours(false)
  }

  async function reviewRequest(id, action) {
    const req = requests.find(r => r.id === id)
    const adminPhone = '01288894721'

    const { error: updateErr } = await supabase.from('appointments').update({
      status: action,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)

    if (updateErr) {
      console.error('reviewRequest update failed:', updateErr)
      // Try without reviewed_at in case column doesn't exist
      const { error: retryErr } = await supabase.from('appointments')
        .update({ status: action })
        .eq('id', id)
      if (retryErr) {
        console.error('reviewRequest retry failed:', retryErr)
        alert('فشل تحديث الحجز: ' + retryErr.message)
        return
      }
    }

    // Send notification to client
    if (req?.client?.id) {
      const isApproved = action === 'confirmed'
      await supabase.from('notifications').insert({
        target_user_id: req.client.id,
        title: isApproved ? 'تم قبول حجزك ✅' : 'تم رفض حجزك ❌',
        body: isApproved
          ? `تم تأكيد موعدك مع ${req.barber?.name || 'الحلاق'}. نراك قريباً! ✂️`
          : `للأسف تم رفض طلب الحجز. للاستفسار تواصل معنا على: ${adminPhone}`,
        type: isApproved ? 'booking_approved' : 'booking_rejected',
        action_url: isApproved ? null : adminPhone,
        sent_by: (await supabase.auth.getUser()).data.user?.id,
      })
    }

    setRequests(prev => prev.filter(r => r.id !== id))
    setStats(s => ({ ...s, pending: Math.max(0, s.pending - 1) }))
  }

  async function getReceiptUrl(path) {
    if (!path) return
    const { data } = await supabase.storage.from('instapay-receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) setViewingReceipt(data.signedUrl)
  }

  /* ── Derived ── */
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const apptByHour = {}
  appointments.forEach(a => { apptByHour[new Date(a.scheduled_at).getHours()] = a })
  const selectedDateLabel = `${DAYS_AR[selectedDay.getDay()]}، ${selectedDay.getDate()} ${MONTHS_AR[selectedDay.getMonth()]}`
  const firstName = user?.name?.split(' ')[0] || 'مدير'

  return (
    <div className="dash-page">

      {/* Greeting */}
      <div className="dash-greeting">
        <div className="greeting-hi">{getGreeting()}، <span>{firstName}</span></div>
        <div className="greeting-sub">{DAYS_AR[new Date().getDay()]} {new Date().getDate()} {MONTHS_AR[new Date().getMonth()]}</div>
      </div>

      {/* ── Shop toggle — compact single card ── */}
      <div className="dsh-shop-card">
        <button className={`dsh-toggle ${shopSettings.is_open ? 'on' : 'off'}`} onClick={toggleShopOpen}>
          <span className="dsh-toggle-knob" />
        </button>
        <div className="dsh-shop-info">
          <div className="dsh-shop-status">
            <span className={`status-dot ${shopSettings.is_open ? 'open' : 'closed'}`} />
            <span className="dsh-shop-label">{shopSettings.is_open ? 'المحل مفتوح' : 'المحل مغلق'}</span>
          </div>
          <div className="dsh-shop-sub">
            {`اليوم ${shopSettings.open_time} – ${shopSettings.close_time}`}
            <button className="dsh-edit-link" onClick={() => setShowHoursEditor(v => !v)}>
              {showHoursEditor ? ' · إخفاء' : ' · تعديل الساعات ‹'}
            </button>
          </div>
        </div>
      </div>

      {showHoursEditor && (
        <div className="working-hours-card">
          <div className="wh-row">
            <div className="wh-field">
              <label className="wh-label">الفتح</label>
              <input type="time" className="wh-input" value={shopSettings.open_time}
                onChange={e => setShopSettings(s => ({ ...s, open_time: e.target.value }))} />
            </div>
            <div className="wh-divider">—</div>
            <div className="wh-field">
              <label className="wh-label">الإغلاق</label>
              <input type="time" className="wh-input" value={shopSettings.close_time}
                onChange={e => setShopSettings(s => ({ ...s, close_time: e.target.value }))} />
            </div>
            <button className="wh-save-btn" onClick={saveHours} disabled={savingHours}>
              {savingHours ? <span className="app-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'حفظ'}
            </button>
          </div>
        </div>
      )}

      {/* Stats — pending first (highlighted gold), then week, then today */}
      <div className="dash-stats-row">
        <div className="stat-chip" style={stats.pending > 0 ? { borderColor:'#c9a84c', background:'rgba(201,168,76,0.06)' } : {}}>
          <span className="stat-chip-val" style={stats.pending > 0 ? { color:'#c9a84c' } : {}}>{stats.pending}</span>
          <span className="stat-chip-label">طلبات معلقة</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-val">{stats.week}</span>
          <span className="stat-chip-label">هذا الأسبوع</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-val">{stats.today}</span>
          <span className="stat-chip-label">حجوزات اليوم</span>
        </div>
      </div>

      {/* ── Services menu ── */}
      <ServicesSection />

      {/* ── Reservation Requests ── */}
      <div className="requests-section">
        <div className="section-header">
          <span className="section-title">طلبات الحجز</span>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            {stats.pending > 0 && <span className="badge-count">{stats.pending}</span>}
            <button className="dsh-view-all-btn" onClick={() => setShowAllRequests(v => !v)}>
              {showAllRequests ? 'إخفاء' : 'عرض الكل'}
            </button>
          </div>
        </div>

        {loadingReq ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'1.5rem' }}>
            <div className="app-spinner" style={{ width:28, height:28 }} />
          </div>
        ) : requests.length === 0 ? (
          <div className="req-empty">
            <CheckCircleIcon />
            <span>لا توجد طلبات معلقة</span>
          </div>
        ) : (
          (showAllRequests ? requests : requests.slice(0, 2)).map(req => (
            <InlineRequestCard
              key={req.id}
              req={req}
              onApprove={() => reviewRequest(req.id, 'confirmed')}
              onReject={() => reviewRequest(req.id, 'rejected')}
              onViewDetail={() => setDetailReq(req)}
            />
          ))
        )}
      </div>

      {/* ── Week schedule ── */}
      <div className="week-section">
        <div className="section-header">
          <span className="section-title">جدول الأسبوع</span>
          <button className="dsh-services-link" onClick={() => {}}>الخدمات والأسعار ‹</button>
        </div>
        <div className="week-strip">
          {weekDays.map((d, i) => {
            const isSel = d.toDateString() === selectedDay.toDateString()
            return (
              <button key={i} className={`day-pill ${isSel ? 'active' : ''}`} onClick={() => setSelectedDay(d)}>
                <span className="day-pill-name">{DAYS_AR[d.getDay()].slice(0,3)}</span>
                <span className="day-pill-num">{d.getDate()}</span>
                <span className="day-dot" />
              </button>
            )
          })}
        </div>

        {barbers.length > 0 && (
          <div className="barber-selector">
            {barbers.map(b => (
              <button key={b.id} className={`barber-chip ${selectedBarber?.id === b.id ? 'active' : ''}`} onClick={() => setSelectedBarber(b)}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        <div className="schedule-card">
          <div className="schedule-card-header">
            <span className="schedule-date-label">{selectedDateLabel}</span>
            {selectedBarber && <span className="schedule-barber-label">✂️ {selectedBarber.name}</span>}
          </div>
          <div className="schedule-timeline">
            {hours.map(h => {
              const appt = apptByHour[h]
              return (
                <div className="hour-row" key={h}>
                  <div className="hour-label">{formatHour(h)}</div>
                  <div className="hour-slot">
                    {appt ? (
                      <div className="booking-block">
                        <span className="booking-client">{appt.client?.name || 'عميل'}</span>
                        <span className="booking-service">{appt.services?.name || 'خدمة'}</span>
                      </div>
                    ) : <span className="hour-empty">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {barbers.length === 0 && (
          <div className="empty-state">
            <ScissorsIconLg />
            <p>لا يوجد حلاقون<br />أضف فريقك من تبويب الفريق</p>
          </div>
        )}
      </div>

    </div>
  )
}

/* ── Inline Request Card (Design 3 — compact, direct approve/reject) ── */
function InlineRequestCard({ req, onApprove, onReject, onViewDetail }) {
  const [acting, setActing] = useState(null)
  const date = new Date(req.scheduled_at)
  const timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`
  const isToday = new Date().toDateString() === date.toDateString()
  const isTomorrow = (() => { const t=new Date(); t.setDate(t.getDate()+1); return t.toDateString()===date.toDateString() })()
  const dayLabel = isToday ? 'اليوم' : isTomorrow ? 'غداً' : `${date.getDate()}/${date.getMonth()+1}`

  async function act(fn, label) {
    setActing(label); await fn(); setActing(null)
  }

  return (
    <div className="irc-card" onClick={onViewDetail}>
      {/* Left: big time */}
      <div className="irc-time-block">
        <span className="irc-time">{timeStr}</span>
        <span className="irc-day">{dayLabel} · {req.deposit_amount} ج</span>
      </div>

      {/* Right: client + service info + actions */}
      <div className="irc-right">
        <div className="irc-info">
          <span className="irc-client">{req.client?.name || 'عميل'}</span>
          <span className="irc-detail">
            {req.services?.name || ''}
            {req.barber?.name ? ` · ${req.barber.name}` : ''}
          </span>
        </div>
        <div className="irc-btns" onClick={e => e.stopPropagation()}>
          <button className="irc-btn reject" disabled={!!acting}
            onClick={() => act(onReject, 'reject')}>
            {acting === 'reject' ? <span className="btn-spinner" style={{width:14,height:14,borderTopColor:'#e74c3c'}} /> : 'رفض'}
          </button>
          <button className="irc-btn approve" disabled={!!acting}
            onClick={() => act(onApprove, 'approve')}>
            {acting === 'approve' ? <span className="btn-spinner" style={{width:14,height:14,borderTopColor:'#000'}} /> : 'قبول'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Reservation card (full detail sheet — kept for tap-to-view) ── */
function ReservationCard({ req, onApprove, onReject }) {
  const [open, setOpen]           = useState(false)
  const [acting, setActing]       = useState(null)   // 'approve' | 'reject'
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [loadingImg, setLoadingImg] = useState(false)
  const [copied, setCopied]       = useState(false)
  const ADMIN_PHONE = '01288894721'

  const date    = new Date(req.scheduled_at)
  const dateStr = `${DAYS_AR[date.getDay()]} ${date.getDate()} ${MONTHS_AR[date.getMonth()]} - ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`

  async function openSheet() {
    setOpen(true)
    if (req.instapay_image_url && !receiptUrl) {
      setLoadingImg(true)
      const { data } = await supabase.storage
        .from('instapay-receipts')
        .createSignedUrl(req.instapay_image_url, 300)
      if (data?.signedUrl) setReceiptUrl(data.signedUrl)
      setLoadingImg(false)
    }
  }

  async function act(fn, label) {
    setActing(label)
    await fn()
    setActing(null)
    setOpen(false)
  }

  function copyPhone() {
    navigator.clipboard.writeText(ADMIN_PHONE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Summary row — tap to open */}
      <div className="req-card" onClick={openSheet} style={{ cursor: 'pointer' }}>
        <div className="req-top">
          <div className="req-client-info">
            <span className="req-name">{req.client?.name || 'عميل'}</span>
            <span className="req-phone">{req.client?.phone}</span>
          </div>
          <span className="req-badge">معلق</span>
        </div>
        <div className="req-details">
          <span className="req-detail-row"><CalendarIconSm /> {dateStr}</span>
          {req.services?.name  && <span className="req-detail-row"><ScissorsSm /> {req.services.name}</span>}
          {req.barber?.name    && <span className="req-detail-row"><ScissorsSm /> مع {req.barber.name}</span>}
          {req.deposit_amount  && <span className="req-detail-row"><MoneyIcon /> إيداع: {req.deposit_amount} ج.م</span>}
        </div>
        <div className="req-tap-hint">اضغط للمراجعة ←</div>
      </div>

      {/* Bottom sheet — full details + receipt + actions */}
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-sheet req-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title">مراجعة طلب الحجز</div>

            {/* Client info */}
            <div className="req-sheet-section">
              <div className="req-sheet-row">
                <span className="req-sheet-label">العميل</span>
                <span className="req-sheet-val">{req.client?.name || '—'}</span>
              </div>
              <div className="req-sheet-row">
                <span className="req-sheet-label">الهاتف</span>
                <span className="req-sheet-val" style={{ direction: 'ltr' }}>{req.client?.phone || '—'}</span>
              </div>
              <div className="req-sheet-row">
                <span className="req-sheet-label">الحلاق</span>
                <span className="req-sheet-val">{req.barber?.name || '—'}</span>
              </div>
              <div className="req-sheet-row">
                <span className="req-sheet-label">الخدمة</span>
                <span className="req-sheet-val">{req.services?.name || '—'}</span>
              </div>
              <div className="req-sheet-row">
                <span className="req-sheet-label">الموعد</span>
                <span className="req-sheet-val">{dateStr}</span>
              </div>
              <div className="req-sheet-row">
                <span className="req-sheet-label">العربون</span>
                <span className="req-sheet-val" style={{ color: 'var(--gold)', fontWeight: 800 }}>{req.deposit_amount} ج.م</span>
              </div>
              {req.notes && (
                <div className="req-sheet-row">
                  <span className="req-sheet-label">ملاحظات</span>
                  <span className="req-sheet-val" style={{ fontStyle: 'italic', color: 'var(--text-soft)' }}>"{req.notes}"</span>
                </div>
              )}
            </div>

            {/* Receipt image */}
            <div className="req-receipt-block">
              <div className="req-receipt-label"><ImageIcon /> إيصال InstaPay</div>
              {loadingImg ? (
                <div className="req-receipt-loading">
                  <div className="app-spinner" style={{ width: 28, height: 28 }} />
                </div>
              ) : receiptUrl ? (
                <img src={receiptUrl} alt="إيصال" className="req-receipt-img" />
              ) : (
                <div className="req-receipt-loading" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  لا يوجد إيصال
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="req-sheet-actions">
              <button
                className="req-btn reject"
                onClick={() => act(onReject, 'reject')}
                disabled={!!acting}
              >
                {acting === 'reject'
                  ? <span className="btn-spinner" style={{ width: 16, height: 16, borderTopColor: '#e74c3c' }} />
                  : '✗ رفض'}
              </button>
              <button
                className="req-btn approve"
                onClick={() => act(onApprove, 'approve')}
                disabled={!!acting}
              >
                {acting === 'approve'
                  ? <span className="btn-spinner" style={{ width: 16, height: 16, borderTopColor: '#000' }} />
                  : '✓ قبول'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Helpers ── */
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'صباح الخير'
  if (h < 17) return 'مساء الخير'
  return 'مساء النور'
}
function greetEmoji() {
  const h = new Date().getHours()
  if (h < 12) return '☀️'
  if (h < 17) return '👋'
  return '🌙'
}

/* ── Icons ── */
function ClockIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function CheckCircleIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:32,height:32,opacity:0.25}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> }
function ImageIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> }
function CloseIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function CalendarIconSm() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,flexShrink:0}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function ScissorsSm()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,flexShrink:0}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
function MoneyIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,flexShrink:0}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> }
function ScissorsIconLg() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:48,height:48,opacity:0.2}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
