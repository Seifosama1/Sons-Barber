import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useConfirm } from '../context/ConfirmContext'

// Service-role client for sending notifications to all affected clients
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_KEY  = import.meta.env.VITE_SUPABASE_SERVICE_KEY

async function serviceRoleFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

export default function ServicesSection() {
  const { askConfirm } = useConfirm()
  const [services, setServices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [sheet, setSheet]         = useState(null)
  const [showAll, setShowAll]     = useState(false)

  useEffect(() => { fetchServices() }, [])

  useRealtime('services', {}, (payload) => {
    if (payload.eventType === 'INSERT' && payload.new) {
      setServices(prev => [...prev, payload.new])
    }
    if (payload.eventType === 'UPDATE' && payload.new) {
      setServices(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s))
    }
    if (payload.eventType === 'DELETE' && payload.old) {
      setServices(prev => prev.filter(s => s.id !== payload.old.id))
    }
  })

  async function fetchServices() {
    setLoading(true)
    const { data } = await supabase.from('services').select('*').order('created_at')
    setServices(data || [])
    setLoading(false)
  }

  async function toggleActive(service) {
    const { data } = await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id).select().single()
    if (data) setServices(prev => prev.map(s => s.id === data.id ? data : s))
  }

  async function deleteService(id) {
    const svc = services.find(s => s.id === id)
    const confirmed = await askConfirm({
      title: 'حذف الخدمة',
      message: `هل أنت متأكد من حذف خدمة "${svc?.name || ''}" نهائياً؟`,
      confirmText: 'نعم، حذف الخدمة',
      cancelText: 'إلغاء',
      type: 'danger',
    })
    if (!confirmed) return
    await supabase.from('services').delete().eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  function onSaved(service, isNew) {
    if (isNew) setServices(prev => [...prev, service])
    else setServices(prev => prev.map(s => s.id === service.id ? service : s))
    setSheet(null)
  }

  function finalPrice(svc) {
    if (!svc.discount_pct || svc.discount_pct === 0) return svc.price
    return (svc.price * (1 - svc.discount_pct / 100)).toFixed(0)
  }

  // Show only the last added service in the collapsed view
  const lastService = services.length > 0 ? services[services.length - 1] : null
  const hasMore = services.length > 1

  return (
    <div className="services-section">
      <div className="section-header">
        <span className="section-title">الخدمات والأسعار</span>
        <button className="add-btn" style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
          onClick={() => setSheet({ mode: 'add' })}>
          <PlusIcon /> إضافة
        </button>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'1rem' }}>
          <div className="app-spinner" style={{ width:28, height:28 }} />
        </div>
      ) : services.length === 0 ? (
        <div className="req-empty"><ScissorsIcon /><span>لا توجد خدمات — أضف أول خدمة</span></div>
      ) : (
        <>
          {/* Always show latest service */}
          {lastService && (
            <ServiceRow svc={lastService} finalPrice={finalPrice} onEdit={() => setSheet({ mode:'edit', service: lastService })} onToggle={() => toggleActive(lastService)} onDelete={() => deleteService(lastService.id)} />
          )}

          {/* View more button */}
          {hasMore && (
            <button className="svc-view-more-btn" onClick={() => setShowAll(true)}>
              عرض جميع الخدمات ({services.length}) ↓
            </button>
          )}
        </>
      )}

      {sheet && (
        <ServiceSheet mode={sheet.mode} service={sheet.service} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}

      {/* Full services sheet */}
      {showAll && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAll(false)}>
          <div className="modal-sheet">
            <div className="sheet-handle" />
            <div className="sheet-title">جميع الخدمات</div>
            <div className="services-list">
              {services.map(svc => (
                <ServiceRow key={svc.id} svc={svc} finalPrice={finalPrice}
                  onEdit={() => { setShowAll(false); setSheet({ mode:'edit', service: svc }) }}
                  onToggle={() => toggleActive(svc)}
                  onDelete={() => deleteService(svc.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceRow({ svc, finalPrice, onEdit, onToggle, onDelete }) {
  return (
    <div className={`service-row ${!svc.is_active ? 'inactive' : ''}`}>
      <div className="service-row-info">
        <div className="service-row-name">{svc.name}</div>
        {svc.description && <div className="service-row-desc">{svc.description}</div>}
        <div className="service-row-meta">
          <span className="service-duration"><ClockIcon /> {svc.duration} دقيقة</span>
          {!svc.is_active && <span className="service-inactive-tag">متوقفة</span>}
        </div>
      </div>
      <div className="service-row-price-block">
        {svc.discount_pct > 0 ? (
          <>
            <span className="service-old-price">{svc.price} ج</span>
            <span className="service-final-price">{finalPrice(svc)} ج</span>
            <span className="service-discount-badge">-{svc.discount_pct}%</span>
          </>
        ) : (
          <span className="service-final-price">{svc.price} ج</span>
        )}
      </div>
      <div className="service-row-actions">
        <button className="icon-btn" onClick={onEdit} aria-label="تعديل"><EditIcon /></button>
        <button className="icon-btn" onClick={onToggle} aria-label="تفعيل/تعطيل" style={{ color: svc.is_active ? '#2ecc71' : '#666' }}><ToggleIcon active={svc.is_active} /></button>
        <button className="icon-btn danger" onClick={onDelete} aria-label="حذف"><TrashIcon /></button>
      </div>
    </div>
  )
}

/* ── Notify ALL clients when an offer/discount is added or service created ── */
async function notifyClientsOfDiscount(service, isNew = false) {
  const hasDiscount = service.discount_pct && service.discount_pct > 0
  const finalPrice = hasDiscount
    ? Math.round(service.price * (1 - service.discount_pct / 100))
    : service.price

  // 1. Fetch all registered clients from profiles table (bypassing RLS with service role)
  const res = await serviceRoleFetch(
    `/rest/v1/profiles?select=id&role=eq.client`,
  )
  if (!res.ok) {
    console.error('Failed to fetch clients for service notification:', await res.text())
    return
  }
  const clients = await res.json()

  // Deduplicate client IDs
  const clientIds = [...new Set(clients.map(c => c.id).filter(Boolean))]
  if (clientIds.length === 0) return

  // 2. Craft notification title and body
  const title = hasDiscount
    ? `🔥 عرض خاص: ${service.name}`
    : `✨ خدمة جديدة: ${service.name}`

  const body = hasDiscount
    ? `تم تطبيق خصم ${service.discount_pct}% على خدمة "${service.name}"! السعر الآن: ${finalPrice} ج.م بدلاً من ${service.price} ج.م. احجز موعدك الآن!`
    : `تمت إضافة خدمة جديدة "${service.name}" بسعر ${service.price} ج.م. متاحة للحجز الآن!`

  // 3. Insert one notification per client
  const notifications = clientIds.map(clientId => ({
    target_user_id: clientId,
    title,
    body,
    type: 'offer',
    is_read: false,
    sent_at: new Date().toISOString(),
  }))

  const insertRes = await serviceRoleFetch('/rest/v1/notifications', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(notifications),
  })

  if (!insertRes.ok) {
    console.error('Failed to insert service notifications:', await insertRes.text())
  }

  // Send FCM push to every client so they receive it even when app is killed/backgrounded
  const fcmBase = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://sonsbarber-app.vercel.app'

  const fcmPromises = clientIds.map(clientId =>
    fetch(`${fcmBase}/api/send-fcm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: clientId,
        title,
        body,
        data: { type: 'offer' }
      })
    }).catch(() => {})
  )
  // Fire all FCM pushes in parallel, non-blocking
  Promise.all(fcmPromises).catch(() => {})
}

/* ── Add / Edit Sheet ── */
function ServiceSheet({ mode, service, onClose, onSaved }) {
  const { askConfirm } = useConfirm()
  const isNew = mode === 'add'
  const [name, setName]           = useState(service?.name        || '')
  const [description, setDesc]    = useState(service?.description || '')
  const [price, setPrice]         = useState(service?.price       ?? '')
  const [duration, setDuration]   = useState(service?.duration    ?? 30)
  const [discount, setDiscount]   = useState(service?.discount_pct ?? 0)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const finalPrice = discount > 0 ? (price * (1 - discount / 100)).toFixed(0) : null

  async function handleSave() {
    setError('')
    if (!name.trim())          { setError('أدخل اسم الخدمة'); return }
    if (!price || price <= 0)  { setError('أدخل سعراً صحيحاً'); return }
    if (!duration || duration <= 0) { setError('أدخل مدة صحيحة'); return }
    if (discount < 0 || discount > 100) { setError('الخصم بين 0 و 100'); return }

    const ok = await askConfirm({
      title: isNew ? 'إضافة خدمة جديدة' : 'تعديل الخدمة',
      message: isNew
        ? `هل أنت متأكد من إضافة خدمة "${name.trim()}" بسعر ${price} ج.م؟`
        : `هل أنت متأكد من حفظ التعديلات على خدمة "${service.name}"؟`,
      confirmText: isNew ? 'نعم، إضافة الخدمة' : 'نعم، حفظ التعديل',
      cancelText: 'إلغاء',
      type: 'warning',
    })
    if (!ok) return

    setSaving(true)
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: parseFloat(price),
      duration: parseInt(duration),
      discount_pct: parseFloat(discount) || 0,
    }

    if (isNew) {
      const { data, error: err } = await supabase.from('services').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      // Notify all clients about the newly created service or offer
      await notifyClientsOfDiscount(data, true)
      onSaved(data, true)
    } else {
      const { data, error: err } = await supabase.from('services').update(payload).eq('id', service.id).select().single()
      if (err) { setError(err.message); setSaving(false); return }

      // If discount was added or changed, or service was updated with an active discount
      const newDiscount = parseFloat(discount) || 0
      const oldDiscount = parseFloat(service.discount_pct) || 0
      const discountChanged = (newDiscount > 0 && newDiscount !== oldDiscount)
      if (discountChanged) {
        await notifyClientsOfDiscount(data, false)
      }

      onSaved(data, false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">{isNew ? 'إضافة خدمة جديدة' : 'تعديل الخدمة'}</div>

        {error && <div className="sheet-error">{error}</div>}

        <div className="sheet-field">
          <label className="sheet-label">اسم الخدمة *</label>
          <input className="sheet-input" placeholder="مثال: قصة + ذقن" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="sheet-field">
          <label className="sheet-label">وصف (اختياري)</label>
          <input className="sheet-input" placeholder="وصف مختصر للخدمة" value={description} onChange={e => setDesc(e.target.value)} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.7rem' }}>
          <div className="sheet-field">
            <label className="sheet-label">السعر (ج.م) *</label>
            <input className="sheet-input" type="number" inputMode="numeric" placeholder="150" value={price}
              onChange={e => setPrice(e.target.value)} dir="ltr" style={{ textAlign:'right' }} />
          </div>
          <div className="sheet-field">
            <label className="sheet-label">المدة (دقيقة) *</label>
            <input className="sheet-input" type="number" inputMode="numeric" placeholder="30" value={duration}
              onChange={e => setDuration(e.target.value)} dir="ltr" style={{ textAlign:'right' }} />
          </div>
        </div>

        <div className="sheet-field">
          <label className="sheet-label">خصم % (0 = بدون خصم)</label>
          <div style={{ position:'relative' }}>
            <input className="sheet-input" type="number" inputMode="numeric" placeholder="0"
              min="0" max="100" value={discount}
              onChange={e => setDiscount(e.target.value)} dir="ltr" style={{ textAlign:'right', paddingLeft:'2.5rem' }} />
            <span style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'#666', fontSize:'0.85rem' }}>%</span>
          </div>
          {finalPrice && (
            <div style={{ fontSize:'0.78rem', color:'#c9a84c', marginTop:'0.3rem' }}>
              السعر بعد الخصم: <strong>{finalPrice} ج.م</strong>
            </div>
          )}
        </div>

        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={handleSave} disabled={saving}>
            {saving ? <span className="btn-spinner" /> : isNew ? 'إضافة' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* Icons */
function PlusIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function EditIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function TrashIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> }
function ClockIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12,flexShrink:0}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function ScissorsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:28,height:28,opacity:0.3}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
function ToggleIcon({ active }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
    {active
      ? <><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3" fill="currentColor"/></>
      : <><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3" fill="currentColor"/></>
    }
  </svg>
}
