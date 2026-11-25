import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'

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
    if (!confirm('حذف هذه الخدمة؟')) return
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
        <span className="section-title">قائمة الخدمات 💈</span>
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
            <div className="sheet-title">جميع الخدمات 💈</div>
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

/* ── Notify all clients with pending/confirmed appointments for this service ── */
async function notifyClientsOfDiscount(service) {
  const finalPrice = Math.round(service.price * (1 - service.discount_pct / 100))

  // 1. Find all clients with active appointments for this service
  const res = await serviceRoleFetch(
    `/rest/v1/appointments?select=client_id&service_id=eq.${service.id}&status=in.(pending,confirmed)`,
  )
  if (!res.ok) return
  const appointments = await res.json()

  // Deduplicate client IDs
  const clientIds = [...new Set(appointments.map(a => a.client_id))]
  if (clientIds.length === 0) return

  // 2. Insert one notification per client
  const notifications = clientIds.map(clientId => ({
    target_user_id: clientId,
    title: `عرض خاص على ${service.name} 🎁`,
    body: `تم تخفيض سعر خدمة "${service.name}" بنسبة ${service.discount_pct}%! السعر الجديد: ${finalPrice} ج.م بدلاً من ${service.price} ج.م. الخصم ينطبق على حجزك الحالي تلقائياً.`,
    type: 'offer',
    is_read: false,
  }))

  await serviceRoleFetch('/rest/v1/notifications', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(notifications),
  })
}

/* ── Add / Edit Sheet ── */
function ServiceSheet({ mode, service, onClose, onSaved }) {
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
      onSaved(data, true)
    } else {
      const { data, error: err } = await supabase.from('services').update(payload).eq('id', service.id).select().single()
      if (err) { setError(err.message); setSaving(false); return }

      // If discount was added or changed, notify all affected clients
      const discountChanged = parseFloat(discount) > 0 && parseFloat(discount) !== (service.discount_pct || 0)
      if (discountChanged) {
        await notifyClientsOfDiscount(data)
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
