import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adminCreateUser, adminUpdatePassword, adminDeleteUser } from '../lib/adminApi'
import { useRealtime } from '../lib/useRealtime'

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
  const [barbers, setBarbers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [sheet, setSheet]       = useState(null)  // { type: 'edit'|'queue'|'add-barber', ... }

  useEffect(() => { fetchBarbers() }, [])

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
      .select('id, name, phone, created_at, rating_avg, rating_count, is_active, on_seat_client_id')
      .eq('role', 'barber')
      .order('created_at')
    setBarbers(data || [])
    setLoading(false)
  }

  async function handleDelete(barber) {
    const confirmed = window.confirm(`هل أنت متأكد من حذف "${barber.name}"؟\nلا يمكن التراجع عن هذه الخطوة.`)
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
        <h2 className="page-title">الفريق ✂️</h2>
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
                      <span className="bc-star">★</span>
                      <span className="bc-rating-val">{(b.rating_avg || 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className={`bc-avatar ${isCutting ? 'cutting' : ''}`}>
                    {b.name[0]}
                    <span className={`bc-online-dot ${b.is_active ? 'on' : 'off'}`} />
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
                  <button className="bc-action-btn" onClick={() => setSheet({ type: 'queue', barber: b })}>
                    الطابور
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
   LIVE QUEUE SHEET
══════════════════════════════════════════════ */
function LiveQueueSheet({ barber, onClose }) {
  const [queue, setQueue]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [subSheet, setSubSheet]     = useState(null) // 'add-client' | { type:'checkout', entry }
  const [onSeatId, setOnSeatId]     = useState(barber.on_seat_client_id)

  useEffect(() => { fetchQueue() }, [])

  useRealtime('waitlist', {}, () => fetchQueue())
  useRealtime('profiles', {}, (p) => {
    if (p.new?.id === barber.id) setOnSeatId(p.new.on_seat_client_id)
  })

  async function fetchQueue() {
    setLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('id, joined_at, status, client_id, walk_in_phone, walk_in_name, added_by_admin, profiles:client_id(name, phone)')
      .eq('barber_id', barber.id)
      .in('status', ['waiting', 'in_service'])
      .order('joined_at', { ascending: true })
    setQueue(data || [])
    // Derive onSeatId from the queue entries — more reliable than profile field
    const inServiceEntry = (data || []).find(e => e.status === 'in_service')
    if (inServiceEntry) setOnSeatId(inServiceEntry.client_id || inServiceEntry.id)
    setLoading(false)
  }

  async function removeFromQueue(entryId) {
    await supabase.from('waitlist').update({ status: 'left' }).eq('id', entryId)
    fetchQueue()
  }

  async function startSession(entry) {
    // Move client to on-seat
    await supabase.from('profiles')
      .update({ on_seat_client_id: entry.client_id || entry.id })
      .eq('id', barber.id)
    await supabase.from('waitlist').update({ status: 'in_service' }).eq('id', entry.id)
    setOnSeatId(entry.client_id || entry.id)
    fetchQueue()
  }

  async function finishSession() {
    // Find the in_service entry from the already-loaded queue
    const inServiceEntry = queue.find(e => e.status === 'in_service')
    if (inServiceEntry) {
      setSubSheet({ type: 'checkout', entry: inServiceEntry })
    } else {
      // Fallback: query DB
      const { data } = await supabase
        .from('waitlist')
        .select('id, client_id, walk_in_phone, walk_in_name, profiles:client_id(name, phone)')
        .eq('barber_id', barber.id)
        .eq('status', 'in_service')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setSubSheet({ type: 'checkout', entry: data })
    }
  }

  async function afterCheckout() {
    // Clear on_seat
    await supabase.from('profiles').update({ on_seat_client_id: null }).eq('id', barber.id)
    setOnSeatId(null)
    setSubSheet(null)
    fetchQueue()
    // Notify next in line if exists
    const { data: next } = await supabase
      .from('waitlist')
      .select('client_id')
      .eq('barber_id', barber.id)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (next?.client_id) {
      await serviceInsert('notifications', {
        target_user_id: next.client_id,
        title: 'حان دورك! ✂️',
        body: `${barber.name} جاهز لك الآن، توجه للمحل.`,
        type: 'next_in_queue',
        is_read: false,
      })
    }
  }

  const displayName = (entry) =>
    entry.profiles?.name || entry.walk_in_name || entry.walk_in_phone || 'زبون'
  const displayPhone = (entry) =>
    entry.profiles?.phone || entry.walk_in_phone || null

  return (
    <>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-sheet lq-sheet">
          <div className="sheet-handle" />
          <div className="lq-header">
            <div className="lq-barber-title">
              <div className="lq-barber-avatar">{barber.name[0]}</div>
              <span className="lq-barber-name">{barber.name}</span>
            </div>
            <span className={`lq-seat-badge ${onSeatId ? 'busy' : 'free'}`}>
              {onSeatId ? 'على الكرسي' : 'متاح'}
            </span>
          </div>

          {/* On-seat action */}
          {onSeatId ? (
            <button className="lq-finish-btn" onClick={finishSession}>
              <CheckIcon /> إنهاء الجلسة الحالية
            </button>
          ) : null}

          {/* Queue list */}
          <div className="lq-section-title">
            قائمة الانتظار {queue.length > 0 && <span className="lq-count">{queue.length}</span>}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
              <div className="app-spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : queue.length === 0 ? (
            <div className="lq-empty">لا يوجد عملاء في الانتظار</div>
          ) : (
            <div className="lq-list">
              {queue.map((entry, i) => (
                <div key={entry.id} className="lq-entry">
                  <div className="lq-pos">{i + 1}</div>
                  <div className="lq-entry-info">
                    <span className="lq-entry-name">{displayName(entry)}</span>
                    {displayPhone(entry) && (
                      <span className="lq-entry-phone" dir="ltr">{displayPhone(entry)}</span>
                    )}
                    {entry.status === 'in_service' && <span className="lq-on-chair-tag">✂️ على الكرسي</span>}
                    {entry.added_by_admin && entry.status !== 'in_service' && <span className="lq-admin-tag">أضافه الأدمن</span>}
                  </div>
                  <div className="lq-entry-actions">
                    {!onSeatId && i === 0 && entry.status === 'waiting' && (
                      <button className="lq-start-btn" onClick={() => startSession(entry)}>
                        ابدأ ✂️
                      </button>
                    )}
                    {onSeatId && i === 0 && entry.status === 'waiting' && (
                      <span className="lq-waiting-tag">ينتظر</span>
                    )}
                    <button className="icon-btn danger" onClick={() => removeFromQueue(entry.id)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add client button */}
          <button className="lq-add-btn" onClick={() => setSubSheet({ type: 'add-client' })}>
            <PlusIcon /> إضافة عميل للقائمة
          </button>
        </div>
      </div>

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
            <span className="lq-found-badge">تم العثور ✓</span>
          </div>
        )}
        {found && isWalkin && (
          <div className="lq-found-card walkin">
            <div className="lq-found-avatar">👤</div>
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

  useEffect(() => { fetchServices() }, [])

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

  const finalPrice = selService
    ? selService.discount_pct > 0
      ? Math.round(selService.price * (1 - selService.discount_pct / 100))
      : selService.price
    : 0

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

    // 3. Mark waitlist entry done
    if (entry?.id) {
      await supabase.from('waitlist').update({ status: 'done' }).eq('id', entry.id)
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
        <div className="sheet-title">تسوية الحساب 💰</div>

        {/* Summary */}
        <div className="co-summary">
          <div className="co-row"><span>الحلاق</span><strong>{barber.name}</strong></div>
          <div className="co-row"><span>العميل</span><strong>{clientName}</strong></div>
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
            {saving ? <span className="btn-spinner" /> : 'تأكيد وإنهاء ✓'}
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
function QueueIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> }
function CheckIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function ScissorsIconLg(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:48,height:48,opacity:0.2}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
