import { useState, useEffect, useRef } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { adminCreateUser, adminUpdatePassword, adminDeleteUser } from '../lib/adminApi'
import { queueTurnText } from '../lib/notifText'
import { useRealtime } from '../lib/useRealtime'
import { serviceSelect, serviceUpdate } from '../lib/serviceDb'
import { useConfirm } from '../context/ConfirmContext'

const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Service-role insert (bypasses RLS for sending notifications + writing transactions)
async function serviceInsert(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  return { data: Array.isArray(data) ? data[0] : data, error: res.ok ? null : data }
}

export default function CrewTab() {
  const { askConfirm } = useConfirm()
  const [barbers, setBarbers]   = useState([])
  const [waitingCounts, setWaitingCounts] = useState({})
  const [loading, setLoading]   = useState(true)
  const [sheet, setSheet]       = useState(null)  // { type: 'edit'|'queue'|'add-barber', ... }

  useEffect(() => {
    fetchBarbers()
    fetchWaitingCounts()
  }, [])

  useRealtime('waitlist', {}, () => {
    fetchWaitingCounts()
  })

  async function fetchWaitingCounts() {
    const { data } = await supabase
      .from('waitlist')
      .select('barber_id')
      .eq('status', 'waiting')
    const counts = {}
    ;(data || []).forEach(row => {
      counts[row.barber_id] = (counts[row.barber_id] || 0) + 1
    })
    setWaitingCounts(counts)
  }

  useRealtime('profiles', {}, (payload) => {
    if (payload.eventType === 'UPDATE' && payload.new?.role === 'barber') {
      setBarbers(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b))
    }
    if (payload.eventType === 'INSERT' && payload.new?.role === 'barber') fetchBarbers()
    if (payload.eventType === 'DELETE') setBarbers(prev => prev.filter(b => b.id !== payload.old?.id))
  })

  async function fetchBarbers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, created_at, rating_avg, rating_count, is_active, avatar_url, on_seat_client_id')
      .eq('role', 'barber')
      .order('created_at')
    setBarbers(data || [])
    setLoading(false)
  }

  async function handleDelete(barber) {
    const confirmed = await askConfirm({
      title: 'حذف الحلاق',
      message: `هل أنت متأكد من حذف الحلاق "${barber.name}"؟\nلا يمكن التراجع عن هذه الخطوة.`,
      confirmText: 'نعم، حذف الحلاق',
      cancelText: 'إلغاء',
      type: 'danger',
    })
    if (!confirmed) return
    const { error } = await adminDeleteUser(barber.id)
    if (error) { alert(error); return }
    setBarbers(prev => prev.filter(b => b.id !== barber.id))
  }

  function onSaved(barber, isNew) {
    if (isNew) setBarbers(prev => [...prev, barber])
    else setBarbers(prev => prev.map(b => b.id === barber.id ? { ...b, ...barber } : b))
    setSheet(null)
  }

  return (
    <div className="crew-page">
      <div className="page-header">
        <h2 className="page-title">الفريق</h2>
        <button className="add-btn" onClick={() => setSheet({ type: 'add-barber' })}>
          <PlusIcon /> إضافة حلاق
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><div className="app-spinner" style={{ width: 32, height: 32 }} /></div>
      ) : barbers.length === 0 ? (
        <div className="empty-state">
          <ScissorsIconLg />
          <p>لا يوجد حلاقون بعد<br />ابدأ بإضافة أول فرد في الفريق</p>
        </div>
      ) : (
        <>
          {barbers.map(b => {
            const isCutting = !!b.on_seat_client_id
            return (
              <div className="bc-card" key={b.id}>
                {/* Three-dot menu */}
                <button className="bc-menu-btn" onClick={() => setSheet({ type: 'edit', barber: b })}>
                  <DotsIcon />
                </button>

                {/* Top row: info + avatar */}
                <div className="bc-top">
                  <div className="bc-info">
                    <span className="bc-name">{b.name}</span>
                    <span className="bc-phone" dir="ltr">{b.phone}</span>
                    <div className="bc-rating-row">
                      <StarIcon filled={true} />
                      <span className="bc-rating-val">{(b.rating_avg || 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className={`bc-avatar ${isCutting ? 'cutting' : ''}`} style={{ overflow: 'hidden' }}>
                    {b.avatar_url ? (
                      <img src={b.avatar_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      b.name[0]
                    )}
                    <span className={`bc-online-dot ${b.is_active ? 'on' : 'off'}`} />
                    {(waitingCounts[b.id] || 0) > 0 && (
                      <span className="bc-waitlist-dot" title={`${waitingCounts[b.id]} في قائمة الانتظار`}>
                        {waitingCounts[b.id]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status chips row */}
                <div className="bc-chips">
                  <span className={`bc-status-chip ${isCutting ? 'cutting' : b.is_active ? 'available' : 'resting'}`}>
                    {isCutting ? 'يقص الآن' : b.is_active ? 'متاح' : 'في استراحة'}
                  </span>
                  <span className="bc-cuts-chip">
                    <TodayCutsCount barberId={b.id} />
                  </span>
                </div>

                {/* Action buttons */}
                <div className="bc-actions">
                  <button className="bc-action-btn bc-queue-btn" onClick={() => setSheet({ type: 'queue', barber: b })}>
                    <span>الطابور</span>
                    {(waitingCounts[b.id] || 0) > 0 && (
                      <span className="bc-queue-badge">{waitingCounts[b.id]}</span>
                    )}
                  </button>
                  <button className="bc-action-btn" onClick={() => setSheet({ type: 'schedule', barber: b })}>
                    الجدول
                  </button>
                </div>
              </div>
            )
          })}
          <p className="crew-hint">الحذف والتعليق من القائمة ... بعد تأكيد</p>
        </>
      )}

      {/* Add/edit barber sheet */}
      {sheet?.type === 'add-barber' && (
        <BarberSheet mode="add" onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
      {sheet?.type === 'edit' && (
        <BarberSheet mode="edit" barber={sheet.barber} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}

      {/* Live queue sheet */}
      {sheet?.type === 'queue' && (
        <LiveQueueSheet barber={sheet.barber} onClose={() => setSheet(null)} />
      )}

      {sheet?.type === 'schedule' && (
        <ScheduleSheet barber={sheet.barber} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

/* ── Today's cut count chip ── */
function TodayCutsCount({ barberId }) {
  const [count, setCount] = useState('...')
  useEffect(() => {
    const start = new Date(); start.setHours(0,0,0,0)
    const end   = new Date(); end.setHours(23,59,59,999)
    supabase.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', barberId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .then(({ count: c }) => setCount(c || 0))
  }, [barberId])
  return <span>قصات اليوم: {count}</span>
}

/* ── Schedule Sheet ── */
function ScheduleSheet({ barber, onClose }) {
  const DAYS_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
  const [days] = useState(() => Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return d }))
  const [selDay, setSelDay] = useState(days[0])
  const [appts, setAppts]   = useState([])

  useEffect(() => { fetchAppts() }, [selDay])

  async function fetchAppts() {
    const start = new Date(selDay); start.setHours(0,0,0,0)
    const end   = new Date(selDay); end.setHours(23,59,59,999)
    const { data } = await supabase
      .from('appointments')
      .select('id, scheduled_at, status, client:client_id(name), services(name)')
      .eq('barber_id', barber.id)
      .in('status', ['confirmed','pending'])
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .order('scheduled_at')
    setAppts(data || [])
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">جدول {barber.name}</div>
        <div className="week-strip" style={{ gap: '0.4rem' }}>
          {days.map((d,i) => {
            const isSel = d.toDateString() === selDay.toDateString()
            return (
              <button key={i} className={`day-pill ${isSel ? 'active' : ''}`} onClick={() => setSelDay(d)}>
                <span className="day-pill-name">{DAYS_AR[d.getDay()].slice(0,3)}</span>
                <span className="day-pill-num">{d.getDate()}</span>
              </button>
            )
          })}
        </div>
        {appts.length === 0 ? (
          <div className="lq-empty">لا توجد حجوزات في هذا اليوم</div>
        ) : (
          <div className="schedule-sheet-list">
            {appts.map(a => {
              const t = new Date(a.scheduled_at)
              return (
                <div key={a.id} className="ss-appt-row">
                  <span className="ss-time">{t.getHours()}:{String(t.getMinutes()).padStart(2,'0')}</span>
                  <div className="ss-info">
                    <span className="ss-client">{a.client?.name || 'عميل'}</span>
                    <span className="ss-service">{a.services?.name || 'خدمة'}</span>
                  </div>
                  <span className={`ss-status ${a.status}`}>{a.status === 'confirmed' ? 'مؤكد' : 'معلق'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LIVE QUEUE SHEET (REMASTERED UI)
══════════════════════════════════════════════ */
function LiveQueueSheet({ barber, onClose }) {
  const { askConfirm } = useConfirm()
  const [queue, setQueue]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [subSheet, setSubSheet]     = useState(null) // 'add-client' | { type:'checkout', entry }
  const [onSeatId, setOnSeatId]     = useState(barber.on_seat_client_id)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [pendingPayment, setPendingPayment] = useState(null)
  const [expandedQueue, setExpandedQueue]   = useState(false)
  const [undoItem, setUndoItem]             = useState(null) // { entry, timerId, startTime }
  const [notifSent, setNotifSent]           = useState(null) // entryId
  const [swipeOffsets, setSwipeOffsets]     = useState({}) // entryId -> px
  const dragStartRef                        = useRef(null) // { id, startX, currentX }

  const pendingPaymentRef = useRef(null) // Sync ref so fetchQueue always has current pendingPayment ID
  const isFinishingRef = useRef(false) // Guard against double-finish

  useEffect(() => { fetchQueue() }, [])

  useRealtime('waitlist', {}, () => fetchQueue())
  useRealtime('profiles', {}, (p) => {
    if (p.new?.id === barber.id) setOnSeatId(p.new.on_seat_client_id)
  })

  // Timer for person on chair
  useEffect(() => {
    const chairEntry = queue.find(e => e.status === 'in_service' && e.id !== pendingPayment?.id)
    if (!chairEntry) {
      setElapsedSec(0)
      return
    }

    // Key in localStorage so it persists across re-renders and re-fetches
    const storageKey = `chair_start_${barber.id}_${chairEntry.id}`
    let startTime = parseInt(localStorage.getItem(storageKey) || '0', 10)

    if (!startTime || isNaN(startTime)) {
      // If we have a valid joined_at date from db
      if (chairEntry.joined_at) {
        const parsed = new Date(chairEntry.joined_at).getTime()
        if (!isNaN(parsed) && parsed <= Date.now()) {
          startTime = parsed
        } else {
          startTime = Date.now()
        }
      } else {
        startTime = Date.now()
      }
      localStorage.setItem(storageKey, String(startTime))
    }

    const tick = () => {
      const now = Date.now()
      const diff = Math.max(0, Math.floor((now - startTime) / 1000))
      setElapsedSec(diff)
    }

    tick()
    const timerId = setInterval(tick, 1000)
    return () => clearInterval(timerId)
  }, [queue, pendingPayment, barber.id])

  async function fetchQueue() {
    setLoading(true)
    // Use serviceSelect to bypass RLS so profiles:client_id(name, phone, avatar_url) is always returned
    const { data } = await serviceSelect(
      `waitlist?select=id,joined_at,status,client_id,walk_in_phone,walk_in_name,added_by_admin,notified_at,profiles:client_id(name,phone,avatar_url)&barber_id=eq.${barber.id}&status=in.(waiting,in_service,done)&order=joined_at.asc`
    )
    
    const list = data || []
    
    // Find who is waiting or on chair
    const waitingAndChair = list.filter(e => e.status === 'waiting' || e.status === 'in_service')
    setQueue(waitingAndChair)

    // Derive onSeatId from the queue entries
    const inServiceEntry = waitingAndChair.find(e => e.status === 'in_service' && e.id !== pendingPaymentRef.current?.id)
    if (inServiceEntry) setOnSeatId(inServiceEntry.client_id || inServiceEntry.id)
    else setOnSeatId(null)

    // Sync Slot 3 (Pending Payment):
    // If there is an entry marked as waiting for payment via notified_at timestamp or marker
    const paymentWaiting = list.find(e => e.status === 'done' && (
      e.notified_at === '2099-01-01T00:00:00+00:00' ||
      e.notified_at === '2099-01-01T00:00:00.000Z' ||
      e.walk_in_name === 'WAITING_PAYMENT'
    ))

    if (paymentWaiting) {
      setPendingPayment(paymentWaiting)
      pendingPaymentRef.current = paymentWaiting
    } else if (!pendingPaymentRef.current) {
      setPendingPayment(null)
    }

    setLoading(false)
  }

  async function removeFromQueue(entryId) {
    const entry = queue.find(e => e.id === entryId)
    if (!entry) return

    const clientName = entry.client?.name || entry.walk_in_name || 'العميل'
    const ok = await askConfirm({
      title: 'إزالة من قائمة الانتظار',
      message: `هل أنت متأكد من حذف ${clientName} من قائمة الانتظار؟`,
      confirmText: 'نعم، إزالة',
      cancelText: 'إلغاء',
      type: 'danger',
    })
    if (!ok) {
      setSwipeOffsets(prev => ({ ...prev, [entryId]: 0 }))
      return
    }

    // Immediately remove from local state
    setQueue(prev => prev.filter(e => e.id !== entryId))
    setSwipeOffsets(prev => {
      const copy = { ...prev }
      delete copy[entryId]
      return copy
    })

    // If an undo was already pending, finalize it immediately
    if (undoItem?.timerId) {
      clearTimeout(undoItem.timerId)
      await supabase.from('waitlist').update({ status: 'left' }).eq('id', undoItem.entry.id)
    }

    // Start 4.5s undo countdown
    const timerId = setTimeout(async () => {
      await supabase.from('waitlist').update({ status: 'left' }).eq('id', entryId)
      setUndoItem(null)
      fetchQueue()
    }, 4500)

    setUndoItem({ entry, timerId, startTime: Date.now() })
  }

  function handleUndoDelete() {
    if (!undoItem) return
    clearTimeout(undoItem.timerId)
    // Restore entry in local queue
    setQueue(prev => [...prev, undoItem.entry].sort((a,b) => new Date(a.joined_at) - new Date(b.joined_at)))
    setUndoItem(null)
  }

  async function sendNextNotification(entry) {
    if (!entry?.client_id) return
    setNotifSent(entry.id)
    const { title, body } = await queueTurnText(entry.client_id, barber.name)
    await serviceInsert('notifications', {
      target_user_id: entry.client_id,
      title,
      body,
      type: 'next_in_queue',
      is_read: false,
    })
    setTimeout(() => setNotifSent(null), 3000)
  }

  // Pointer / Touch / Mouse Swipe Handlers
  const handlePointerDown = (id, e) => {
    // Only track primary click or touch
    if (e.button !== undefined && e.button !== 0) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    dragStartRef.current = { id, startX: clientX, currentX: clientX }
  }

  const handlePointerMove = (id, e) => {
    if (!dragStartRef.current || dragStartRef.current.id !== id) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const delta = clientX - dragStartRef.current.startX

    // We only allow swiping right (in RTL this moves towards the right/exit)
    if (delta > 0) {
      setSwipeOffsets(prev => ({ ...prev, [id]: Math.min(delta, 180) }))
    }
  }

  const handlePointerUp = (id) => {
    if (!dragStartRef.current || dragStartRef.current.id !== id) return
    const offset = swipeOffsets[id] || 0
    dragStartRef.current = null

    if (offset > 90) {
      // Swiped past threshold -> trigger delete
      removeFromQueue(id)
    } else {
      // Snap back
      setSwipeOffsets(prev => ({ ...prev, [id]: 0 }))
    }
  }

  async function startSession(entry) {
    const now = Date.now()
    localStorage.setItem(`chair_start_${barber.id}_${entry.id}`, String(now))
    // Move client to on-seat
    await supabase.from('profiles')
      .update({ on_seat_client_id: entry.client_id || entry.id })
      .eq('id', barber.id)
    await supabase.from('waitlist').update({ status: 'in_service' }).eq('id', entry.id)
    setOnSeatId(entry.client_id || entry.id)
    fetchQueue()
  }

  async function finishSession() {
    if (isFinishingRef.current) return // Prevent double-tap race
    isFinishingRef.current = true

    // Find the in_service entry from local queue
    const inServiceEntry = queue.find(e => e.status === 'in_service' && e.id !== pendingPaymentRef.current?.id)
    const target = inServiceEntry || null

    if (!target) {
      isFinishingRef.current = false
      return
    }

    // 1. Update state immediately
    pendingPaymentRef.current = target
    setPendingPayment(target)
    setOnSeatId(null)

    // 2. Update DB status to 'done' and tag notified_at as 2099-01-01 future timestamp for live cross-portal sync
    const syncTimestamp = '2099-01-01T00:00:00.000Z'
    await serviceUpdate('waitlist', { status: 'done', notified_at: syncTimestamp }, 'id', target.id)

    // 3. Clear barber's on_seat marker
    await serviceUpdate('profiles', { on_seat_client_id: null }, 'id', barber.id)

    // 4. Clear localStorage timer
    localStorage.removeItem(`chair_start_${barber.id}_${target.id}`)

    fetchQueue()
    isFinishingRef.current = false
  }

  async function afterCheckout() {
    const curPending = pendingPaymentRef.current
    // Clear waiting payment tag in database
    if (curPending?.id) {
      await serviceUpdate('waitlist', { notified_at: null }, 'id', curPending.id)
    }
    // Clear on_seat and pending payment
    await serviceUpdate('profiles', { on_seat_client_id: null }, 'id', barber.id)
    setOnSeatId(null)
    pendingPaymentRef.current = null
    setPendingPayment(null)
    setSubSheet(null)
    fetchQueue()
    // Notify next in line if exists
    const { data: nextList } = await serviceSelect(
      `waitlist?select=client_id&barber_id=eq.${barber.id}&status=eq.waiting&order=joined_at.asc&limit=1`
    )
    const next = nextList?.[0]
    if (next?.client_id) {
      const { title, body } = await queueTurnText(next.client_id, barber.name)
      await serviceInsert('notifications', {
        target_user_id: next.client_id,
        title,
        body,
        type: 'next_in_queue',
        is_read: false,
      })
    }
  }

  const displayName = (entry) => {
    if (!entry) return 'عميل'
    if (entry?.profiles?.name) return entry.profiles.name
    if (entry?.walk_in_name && entry.walk_in_name !== 'WAITING_PAYMENT' && entry.walk_in_name !== 'عميل بدون تطبيق') {
      return entry.walk_in_name
    }
    if (entry?.walk_in_phone) return `عميل (${entry.walk_in_phone.slice(-4)})`
    return entry?.client_id ? 'عميل بالتطبيق' : (entry?.walk_in_name || 'عميل بدون تطبيق')
  }
  const displayAvatar = (entry) =>
    entry?.profiles?.avatar_url || null
  const displayPhone = (entry) =>
    entry?.profiles?.phone || entry?.walk_in_phone || null
  const isAppClient = (entry) => !!entry?.client_id

  const formatTimer = (seconds) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  const waitingList = queue.filter(e => e.status === 'waiting' && e.id !== pendingPayment?.id && e.id !== pendingPaymentRef.current?.id)
  const chairEntry = queue.find(e => e.status === 'in_service' && e.id !== pendingPayment?.id && e.id !== pendingPaymentRef.current?.id)
  
  // Show last 3 or all when expanded
  const displayedWaiting = expandedQueue ? waitingList : waitingList.slice(0, 3)
  const hasMoreThanThree = waitingList.length > 3

  return (
    <>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-sheet lq-sheet-remaster">
          <div className="sheet-handle" />

          {/* Header */}
          <div className="lq-head-bar">
            <div className="lq-head-user">
              <div className="lq-head-avatar" style={{ overflow: 'hidden' }}>
                {barber.avatar_url ? (
                  <img src={barber.avatar_url} alt={barber.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  barber.name?.[0] || 'ح'
                )}
              </div>
              <div>
                <div className="lq-head-name">{barber.name}</div>
                <div className="lq-head-sub">الطابور المباشر</div>
              </div>
            </div>
            {chairEntry ? (
              <span className="lq-tag cutting">يقص الآن</span>
            ) : (
              <span className="lq-tag onway">متاح</span>
            )}
          </div>

          {/* Slot 1: On Chair (Moved above waiting list) */}
          <section className="lq-slot">
            <div className="lq-slot-hdr">
              <div className="lq-slot-title">
                <span className="lq-slot-num">1</span>
                <span>على الكرسي</span>
              </div>
              <span className="lq-slot-badge">{chairEntry ? 1 : 0}</span>
            </div>

            {chairEntry ? (
              <>
                <div className="lq-cust-card chair-highlight">
                  <div className="lq-cust-left">
                    <div className="lq-cust-avatar-sm" style={{ overflow: 'hidden' }}>
                      {displayAvatar(chairEntry) ? (
                        <img src={displayAvatar(chairEntry)} alt={displayName(chairEntry)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : isAppClient(chairEntry) ? (
                        displayName(chairEntry)[0]
                      ) : (
                        'ح'
                      )}
                    </div>
                    <div className="lq-cust-meta">
                      <div className="lq-cust-name">{displayName(chairEntry)}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="lq-tag cutting">على الكرسي</span>
                      </div>
                      <div className="lq-cust-sub">
                        <span className="lq-sub-badge">
                          {chairEntry.added_by_admin ? 'أضافه الأدمن' : (isAppClient(chairEntry) ? 'عبر التطبيق' : 'حضور مباشر')}
                        </span>
                        {displayPhone(chairEntry) && (
                          <> · <span className="lq-phone-ltr" dir="ltr">{displayPhone(chairEntry)}</span></>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="lq-timer-display" dir="ltr">
                    {formatTimer(elapsedSec)}
                  </div>
                </div>
                <button className="lq-btn-gold-full" onClick={finishSession}>
                  إنهاء الجلسة
                </button>
              </>
            ) : (
              <div className="lq-empty-box">الكرسي فارغ · اضغط ابدأ على أحد العملاء</div>
            )}
          </section>

          {/* Slot 2: Waiting Queue (Expandable, shows first 3 by default) */}
          <section className="lq-slot">
            <div className="lq-slot-hdr">
              <div className="lq-slot-title">
                <span className="lq-slot-num">2</span>
                <span>قائمة الانتظار</span>
              </div>
              <span className="lq-slot-badge">{waitingList.length}</span>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1.2rem' }}>
                <div className="app-spinner" style={{ width: 24, height: 24 }} />
              </div>
            ) : waitingList.length === 0 ? (
              <div className="lq-empty-box">لا أحد في الانتظار</div>
            ) : (
              <div className="lq-cards-group">
                {displayedWaiting.map((entry, i) => {
                  const isApp = isAppClient(entry)
                  const phone = displayPhone(entry)
                  const offset = swipeOffsets[entry.id] || 0
                  const isSwiping = offset > 0
                  const isOverThreshold = offset > 90

                  return (
                    <div
                      key={entry.id}
                      className="lq-swipe-container"
                    >
                      {/* Swipe background action reveal */}
                      <div className={`lq-swipe-bg ${isOverThreshold ? 'over-threshold' : ''}`}>
                        <div className="lq-swipe-bg-content">
                          <TrashIcon />
                          <span>سحب للحذف</span>
                        </div>
                      </div>

                      {/* Foreground card */}
                      <div
                        className={`lq-cust-card ${isSwiping ? 'is-swiping' : ''} ${isOverThreshold ? 'card-delete-alert' : ''}`}
                        style={{
                          transform: `translateX(${offset}px)`,
                          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        }}
                        onPointerDown={(e) => handlePointerDown(entry.id, e)}
                        onPointerMove={(e) => handlePointerMove(entry.id, e)}
                        onPointerUp={() => handlePointerUp(entry.id)}
                        onPointerCancel={() => handlePointerUp(entry.id)}
                      >
                        <div className="lq-cust-left">
                          <div className="lq-cust-avatar-sm" style={{ overflow: 'hidden' }}>
                            {displayAvatar(entry) ? (
                              <img src={displayAvatar(entry)} alt={displayName(entry)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : isApp ? (
                              displayName(entry)[0]
                            ) : (
                              'ح'
                            )}
                          </div>
                          <div className="lq-cust-meta">
                            <div className="lq-cust-name">{displayName(entry)}</div>
                            <div style={{ margin: '3px 0', display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span className="lq-tag waiting">#{i + 1}</span>
                              {isApp && !entry.added_by_admin && (
                                <span className="lq-tag coming">في الطريق</span>
                              )}
                            </div>
                            <div className="lq-cust-sub">
                              <span className="lq-sub-badge">
                                {entry.added_by_admin ? 'أضافه الأدمن' : (isApp ? 'عبر التطبيق' : 'حضور مباشر')}
                              </span>
                              {phone && (
                                <> · <span className="lq-phone-ltr" dir="ltr">{phone}</span></>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="lq-cust-actions" onPointerDown={(e) => e.stopPropagation()}>
                          {!chairEntry && i === 0 && (
                            <button
                              className="lq-btn-gold-sm"
                              onClick={() => startSession(entry)}
                            >
                              ابدأ
                            </button>
                          )}
                          {isApp && (
                            <button
                              className={`lq-btn-icon-bell ${notifSent === entry.id ? 'sent' : ''}`}
                              title="إرسال إشعار للعميل"
                              onClick={() => sendNextNotification(entry)}
                            >
                              <BellIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {hasMoreThanThree && (
                  <button
                    className="lq-expand-toggle-btn"
                    onClick={() => setExpandedQueue(!expandedQueue)}
                  >
                    {expandedQueue
                      ? 'عرض أقل ▲'
                      : `عرض باقي الانتظار (${waitingList.length - 3} إضافي) ▼`}
                  </button>
                )}
              </div>
            )}

            <button
              className="lq-btn-dashed-add"
              onClick={() => setSubSheet({ type: 'add-client' })}
            >
              + إضافة عميل للقائمة
            </button>
          </section>

          {/* Slot 3: Finished & Waiting for Payment */}
          <section className="lq-slot">
            <div className="lq-slot-hdr">
              <div className="lq-slot-title">
                <span className="lq-slot-num">3</span>
                <span>في انتظار الدفع</span>
              </div>
              <span className="lq-slot-badge">{pendingPayment ? 1 : 0}</span>
            </div>

            {pendingPayment ? (
              <div className="lq-cust-card pay-highlight">
                <div className="lq-cust-left">
                  <div className="lq-cust-avatar-sm" style={{ overflow: 'hidden' }}>
                    {displayAvatar(pendingPayment) ? (
                      <img src={displayAvatar(pendingPayment)} alt={displayName(pendingPayment)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : isAppClient(pendingPayment) ? (
                      displayName(pendingPayment)[0]
                    ) : (
                      'ح'
                    )}
                  </div>
                  <div className="lq-cust-meta">
                    <div className="lq-cust-name">{displayName(pendingPayment)}</div>
                    <div style={{ margin: '3px 0' }}>
                      <span className="lq-tag done">متجه إلى الكاشير</span>
                    </div>
                    {displayPhone(pendingPayment) && (
                      <div className="lq-cust-sub">
                        <span className="lq-phone-ltr" dir="ltr">{displayPhone(pendingPayment)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="lq-cust-actions">
                  <button
                    className="lq-btn-gold-sm"
                    onClick={() => setSubSheet({ type: 'checkout', entry: pendingPayment })}
                  >
                    تسجيل الدفع
                  </button>
                </div>
              </div>
            ) : (
              <div className="lq-empty-box">لا يوجد عميل في انتظار الدفع</div>
            )}
          </section>
        </div>
      </div>

      {/* Notification sent mini toast */}
      {notifSent && (
        <div className="lq-notif-toast">
          تم إرسال الإشعار للعميل
        </div>
      )}

      {/* Swipe Delete Undo Toast */}
      {undoItem && (
        <div className="lq-undo-toast">
          <div className="lq-undo-left">
            <span>تم حذف {displayName(undoItem.entry)}</span>
            <button className="lq-undo-btn" onClick={handleUndoDelete}>
              تراجع (Undo)
            </button>
          </div>
          <div className="lq-undo-progress-bar" />
        </div>
      )}

      {/* Add client sub-sheet */}
      {subSheet?.type === 'add-client' && (
        <AddClientSheet
          barber={barber}
          onClose={() => setSubSheet(null)}
          onAdded={() => { setSubSheet(null); fetchQueue() }}
        />
      )}

      {/* Checkout sub-sheet */}
      {subSheet?.type === 'checkout' && (
        <CheckoutSheet
          barber={barber}
          entry={subSheet.entry}
          onClose={() => setSubSheet(null)}
          onConfirmed={afterCheckout}
        />
      )}
    </>
  )
}

/* ══════════════════════════════════════════════
   ADD CLIENT TO QUEUE SHEET
══════════════════════════════════════════════ */
function AddClientSheet({ barber, onClose, onAdded }) {
  const [mode, setMode]       = useState('code')  // 'code' | 'phone'
  const [input, setInput]     = useState('')
  const [found, setFound]     = useState(null)    // profile or null
  const [searching, setSearching] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [error, setError]     = useState('')

  async function lookup() {
    setError(''); setFound(null)
    if (!input.trim()) return
    setSearching(true)
    if (mode === 'code') {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone, client_code')
        .eq('client_code', input.trim())
        .maybeSingle()
      setFound(data || null)
      if (!data) setError('لم يتم العثور على هذا الكود')
    } else {
      const phone = input.trim().replace(/\s/g, '')
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .eq('phone', phone)
        .maybeSingle()
      setFound(data || { _walkin: true, phone })
      if (!data) setError('') // walk-in — will be added as guest
    }
    setSearching(false)
  }

  async function addToQueue() {
    setAdding(true)
    const isWalkin = found?._walkin
    const payload = {
      barber_id:      barber.id,
      status:         'waiting',
      added_by_admin: true,
      ...(isWalkin
        ? { walk_in_phone: found.phone }
        : { client_id: found.id }
      ),
    }
    const { error: err } = await supabase.from('waitlist').insert(payload)
    setAdding(false)
    if (err) { setError(err.message); return }
    onAdded()
  }

  const isWalkin = found?._walkin
  const canAdd   = !!found

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">إضافة عميل للقائمة</div>

        {/* Mode toggle */}
        <div className="lq-mode-toggle">
          <button className={`lq-mode-btn ${mode === 'code' ? 'active' : ''}`} onClick={() => { setMode('code'); setInput(''); setFound(null); setError('') }}>
            كود العميل
          </button>
          <button className={`lq-mode-btn ${mode === 'phone' ? 'active' : ''}`} onClick={() => { setMode('phone'); setInput(''); setFound(null); setError('') }}>
            رقم الهاتف
          </button>
        </div>

        <div className="sheet-field">
          <label className="sheet-label">
            {mode === 'code' ? 'الكود المكوّن من 6 أرقام' : 'رقم الهاتف'}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="sheet-input"
              placeholder={mode === 'code' ? '000000' : '01xxxxxxxxx'}
              value={input}
              onChange={e => { setInput(e.target.value); setFound(null); setError('') }}
              maxLength={mode === 'code' ? 6 : 11}
              inputMode="numeric"
              dir="ltr"
              style={{ textAlign: 'right', flex: 1 }}
            />
            <button className="sheet-save" style={{ flex: 'none', padding: '0 1rem', minWidth: 60 }} onClick={lookup} disabled={searching}>
              {searching ? <span className="btn-spinner" /> : 'بحث'}
            </button>
          </div>
        </div>

        {error && <div className="sheet-error">{error}</div>}

        {/* Found result */}
        {found && !isWalkin && (
          <div className="lq-found-card">
            <div className="lq-found-avatar">{found.name?.[0] || '?'}</div>
            <div className="lq-found-info">
              <span className="lq-found-name">{found.name}</span>
              <span className="lq-found-phone" dir="ltr">{found.phone}</span>
            </div>
            <span className="lq-found-badge">تم العثور</span>
          </div>
        )}
        {found && isWalkin && (
          <div className="lq-found-card walkin">
            <div className="lq-found-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div className="lq-found-info">
              <span className="lq-found-name">زبون بدون تطبيق</span>
              <span className="lq-found-phone" dir="ltr">{found.phone}</span>
            </div>
            <span className="lq-found-badge walkin">زبون عادي</span>
          </div>
        )}

        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={addToQueue} disabled={!canAdd || adding}>
            {adding ? <span className="btn-spinner" /> : '+ إضافة للقائمة'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   CHECKOUT SHEET
══════════════════════════════════════════════ */
function CheckoutSheet({ barber, entry, onClose, onConfirmed }) {
  const [services, setServices]   = useState([])
  const [selService, setSelService] = useState(null)
  const [tendered, setTendered]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Loyalty streak & promo
  const [clientLoyalty, setClientLoyalty] = useState({ total_cuts: 0, loyalty_cuts: 0 })
  const [applyLoyaltyDiscount, setApplyLoyaltyDiscount] = useState(true)
  const [promoCode, setPromoCode]         = useState('')

  useEffect(() => {
    fetchServices()
    if (entry?.client_id) {
      fetchClientLoyalty()
    }
  }, [])

  async function fetchClientLoyalty() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=total_cuts,loyalty_cuts&id=eq.${entry.client_id}`,
        { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
      )
      const data = await res.json()
      const p = Array.isArray(data) ? data[0] : data
      if (p) {
        setClientLoyalty({
          total_cuts: p.total_cuts || 0,
          loyalty_cuts: p.loyalty_cuts || 0,
        })
      }
    } catch (e) {
      console.warn('Failed to fetch client loyalty:', e)
    }
  }

  async function fetchServices() {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, discount_pct, deposit_amount')
      .eq('is_active', true)
      .order('price')
    setServices(data || [])
  }

  const clientName = entry?.profiles?.name || entry?.walk_in_name || entry?.walk_in_phone || 'الزبون'
  const isAppClient = !!entry?.client_id

  // Loyalty check: if client has reached 10 cuts in streak (or is at cut #10)
  const isStreakTen = isAppClient && (clientLoyalty.loyalty_cuts >= 10 || (clientLoyalty.loyalty_cuts === 9))
  const loyaltyQualified = isAppClient && (clientLoyalty.loyalty_cuts >= 9 || (clientLoyalty.loyalty_cuts === 0 && clientLoyalty.total_cuts > 0 && clientLoyalty.total_cuts % 10 === 0))

  const basePrice = selService
    ? selService.discount_pct > 0
      ? Math.round(selService.price * (1 - selService.discount_pct / 100))
      : selService.price
    : 0

  const loyaltyDiscountAmount = (loyaltyQualified && applyLoyaltyDiscount)
    ? Math.round(basePrice * 0.10)
    : 0

  const finalPrice = Math.max(0, basePrice - loyaltyDiscountAmount)

  const change = tendered ? Math.max(0, parseFloat(tendered) - finalPrice) : null

  async function handleConfirm() {
    if (!selService) { setError('اختر الخدمة'); return }
    setSaving(true)

    // 1. Save transaction
    const txPayload = {
      barber_id:      barber.id,
      client_id:      entry?.client_id || null,
      service_id:     selService.id,
      service_name:   selService.name,
      price_charged:  finalPrice,
      original_price: selService.price,
      discount_pct:   selService.discount_pct || 0,
      tendered:       tendered ? parseFloat(tendered) : null,
      change_amount:  change,
      walk_in_phone:  entry?.walk_in_phone || null,
    }
    const { error: txErr } = await serviceInsert('transactions', txPayload)
    if (txErr) { setError('فشل حفظ المعاملة'); setSaving(false); return }

    // 2. Update loyalty for app clients (full service role read+write)
    if (entry?.client_id) {
      try {
        // Read current counts via service role to avoid stale anon cache
        const readRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?select=total_cuts,loyalty_cuts&id=eq.${entry.client_id}`,
          { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
        )
        const profiles = await readRes.json()
        const p = Array.isArray(profiles) ? profiles[0] : profiles
        if (p) {
          const newTotal   = (p.total_cuts || 0) + 1
          const newLoyalty = newTotal % 10
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${entry.client_id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SERVICE_KEY,
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ total_cuts: newTotal, loyalty_cuts: newLoyalty }),
          })
        }
      } catch (e) {
        console.warn('Loyalty update failed:', e)
      }
    }

    // 3. Mark waitlist entry done and clear pending payment tag
    if (entry?.id) {
      await supabaseAdmin.from('waitlist').update({ status: 'done', notified_at: null }).eq('id', entry.id)
    }
    // Note: appointments stay 'confirmed' — they represent bookings.
    // Transactions table is the source of truth for completed/paid sessions.

    // 4. Send rating notification to app client
    if (entry?.client_id) {
      await serviceInsert('notifications', {
        target_user_id: entry.client_id,
        title:          'كيف كانت تجربتك؟ ⭐',
        body:           `قيّم جلستك مع ${barber.name}`,
        type:           'rating_request',
        action_url:     barber.id,  // used by client to submit rating
        is_read:        false,
      })
    }

    setSaving(false)
    onConfirmed()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">تسوية الحساب</div>

        {/* Summary */}
        <div className="co-summary">
          <div className="co-row"><span>الحلاق</span><strong>{barber.name}</strong></div>
          <div className="co-row"><span>العميل</span><strong>{clientName}</strong></div>
          {isAppClient && (
            <div className="co-row">
              <span>سلسلة بطاقة الولاء</span>
              <strong style={{ color: loyaltyQualified ? '#2ecc71' : 'var(--gold)' }}>
                {clientLoyalty.loyalty_cuts} / 10 قصات {loyaltyQualified ? '(مؤهل للخصم!)' : ''}
              </strong>
            </div>
          )}
        </div>

        {/* Loyalty streak discount option */}
        {isAppClient && (
          <div className="co-loyalty-section">
            <div className="co-loyalty-header">
              <span className="co-loyalty-title">خصم إكمال 10 قصات (10%)</span>
              <label className="co-toggle-label">
                <input
                  type="checkbox"
                  checked={applyLoyaltyDiscount && loyaltyQualified}
                  disabled={!loyaltyQualified}
                  onChange={e => setApplyLoyaltyDiscount(e.target.checked)}
                />
                <span className="co-toggle-text">
                  {loyaltyQualified ? 'تطبيق خصم 10%' : `متبقي ${10 - (clientLoyalty.loyalty_cuts || 0)} قصات`}
                </span>
              </label>
            </div>
            {loyaltyQualified && applyLoyaltyDiscount && (
              <div className="co-loyalty-active-msg">تم تفعيل خصم 10% بمناسبة إكمال 10 قصات!</div>
            )}
          </div>
        )}

        {/* Friends promo code slot */}
        <div className="sheet-field">
          <label className="sheet-label">كود دعوة صديق (Friends Promo)</label>
          <div className="co-promo-row">
            <input
              className="sheet-input"
              type="text"
              placeholder="أدخل كود الصديق (مثال: SON-4821)"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              dir="ltr"
              style={{ textAlign: 'center', letterSpacing: '2px', fontWeight: 700 }}
            />
            {promoCode && (
              <span className="co-promo-tag">سيتم احتساب العرض للصديق لاحقاً</span>
            )}
          </div>
        </div>

        {error && <div className="sheet-error">{error}</div>}

        {/* Service select */}
        <div className="sheet-field">
          <label className="sheet-label">الخدمة *</label>
          <div className="co-service-list">
            {services.map(s => {
              const fp = s.discount_pct > 0 ? Math.round(s.price * (1 - s.discount_pct / 100)) : s.price
              return (
                <button
                  key={s.id}
                  className={`co-service-btn ${selService?.id === s.id ? 'selected' : ''}`}
                  onClick={() => setSelService(s)}
                >
                  <span>{s.name}</span>
                  <span className="co-service-price">{fp} ج</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Price breakdown */}
        {selService && (
          <div className="co-price-block">
            {selService.discount_pct > 0 && (
              <div className="co-row muted"><span>السعر الأصلي</span><span style={{ textDecoration: 'line-through' }}>{selService.price} ج</span></div>
            )}
            {loyaltyDiscountAmount > 0 && (
              <div className="co-row" style={{ color: '#2ecc71' }}>
                <span>خصم بطاقة الولاء (10%)</span>
                <strong>- {loyaltyDiscountAmount} ج</strong>
              </div>
            )}
            <div className="co-row"><span>المبلغ المطلوب</span><strong style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>{finalPrice} ج.م</strong></div>
          </div>
        )}

        {/* Tendered */}
        <div className="sheet-field">
          <label className="sheet-label">المبلغ المدفوع (اختياري)</label>
          <input
            className="sheet-input"
            type="number"
            inputMode="numeric"
            placeholder="مثال: 200"
            value={tendered}
            onChange={e => setTendered(e.target.value)}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
          {tendered && selService && (
            <div style={{ fontSize: '0.82rem', color: change >= 0 ? '#2ecc71' : '#e74c3c', marginTop: 4 }}>
              الباقي: {change?.toFixed(2)} ج.م
            </div>
          )}
        </div>

        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={handleConfirm} disabled={!selService || saving}>
            {saving ? <span className="btn-spinner" /> : 'تأكيد وإنهاء'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   BARBER SHEET (add / edit)
══════════════════════════════════════════════ */
function BarberSheet({ mode, barber, onClose, onSaved }) {
  const { askConfirm } = useConfirm()
  const isNew = mode === 'add'
  const [name, setName]         = useState(barber?.name || '')
  const [phone, setPhone]       = useState(barber?.phone || '')
  const [password, setPassword] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('أدخل اسم الحلاق'); return }
    if (isNew && !phone.trim()) { setError('أدخل رقم الهاتف'); return }
    if (isNew && password.length < 6) { setError('كلمة المرور 6 أحرف على الأقل'); return }

    const ok = await askConfirm({
      title: isNew ? 'إضافة حلاق جديد' : 'تعديل بيانات الحلاق',
      message: isNew
        ? `هل أنت متأكد من إضافة الحلاق "${name.trim()}" برقم الهاتف ${phone.trim()}؟`
        : `هل أنت متأكد من حفظ التعديلات على بيانات الحلاق "${barber.name}"؟`,
      confirmText: isNew ? 'نعم، إضافة الحلاق' : 'نعم، حفظ التعديل',
      cancelText: 'إلغاء',
      type: 'warning',
    })
    if (!ok) return

    setSaving(true)

    if (isNew) {
      const { user: authUser, error: createErr } = await adminCreateUser({ phone: phone.trim(), password, name: name.trim(), role: 'barber' })
      if (createErr) { setError(createErr); setSaving(false); return }
      await new Promise(r => setTimeout(r, 600))
      const { data: profile } = await supabase.from('profiles').select('id, name, phone').eq('id', authUser.id).single()
      onSaved(profile || { id: authUser.id, name: name.trim(), phone: phone.trim() }, true)
    } else {
      const updates = {}
      if (name.trim() !== barber.name) updates.name = name.trim()
      if (Object.keys(updates).length) {
        const { error: upErr } = await supabase.from('profiles').update(updates).eq('id', barber.id)
        if (upErr) { setError(upErr.message); setSaving(false); return }
      }
      if (password.length >= 6) {
        const { error: pwErr } = await adminUpdatePassword(barber.id, password)
        if (pwErr) { setError(pwErr); setSaving(false); return }
      } else if (password.length > 0 && password.length < 6) {
        setError('كلمة المرور 6 أحرف على الأقل'); setSaving(false); return
      }
      onSaved({ id: barber.id, name: name.trim(), phone: barber.phone }, false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">{isNew ? 'إضافة حلاق جديد' : 'تعديل بيانات الحلاق'}</div>
        {error && <div className="sheet-error">{error}</div>}
        <div className="sheet-field">
          <label className="sheet-label">الاسم *</label>
          <input className="sheet-input" placeholder="اسم الحلاق" value={name} onChange={e => setName(e.target.value)} />
        </div>
        {isNew && (
          <div className="sheet-field">
            <label className="sheet-label">رقم الهاتف *</label>
            <input className="sheet-input" placeholder="01xxxxxxxxx" value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} />
          </div>
        )}
        <div className="sheet-field">
          <label className="sheet-label">{isNew ? 'كلمة المرور *' : 'كلمة المرور الجديدة (اتركها فارغة للإبقاء)'}</label>
          <input className="sheet-input" placeholder={isNew ? '6 أحرف على الأقل' : '••••••••'} type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={handleSave} disabled={saving}>
            {saving ? <span className="btn-spinner" /> : isNew ? 'إنشاء الحساب' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Star rating ── */
function StarRating({ avg }) {
  return (
    <div className="star-row">
      {[1,2,3,4,5].map(i => {
        const filled  = avg >= i
        const partial = !filled && avg >= i-1 && avg < i
        const pct     = partial ? Math.round((avg-(i-1))*100) : 0
        return (
          <span key={i} className="star-wrap">
            <StarIcon filled={false} />
            {(filled || partial) && <span className="star-fill" style={{ width: filled ? '100%' : `${pct}%` }}><StarIcon filled={true} /></span>}
          </span>
        )
      })}
    </div>
  )
}
function StarIcon({ filled }) {
  return <svg viewBox="0 0 24 24" style={{ width:13,height:13 }} fill={filled?'#c9a84c':'none'} stroke={filled?'#c9a84c':'#333'} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
}

/* ── Icons ── */
function PlusIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function DotsIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg> }
function EditIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function TrashIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function BellIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function QueueIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> }
function CheckIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function ScissorsIconLg(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:48,height:48,opacity:0.2}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
