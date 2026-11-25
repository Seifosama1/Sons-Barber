import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adminDeleteUser, adminUpdatePassword, adminCreateUser } from '../lib/adminApi'
import { useRealtime } from '../lib/useRealtime'
import { useConfirm } from '../context/ConfirmContext'

export default function ClientsTab() {
  const { askConfirm } = useConfirm()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [sheet, setSheet]     = useState(null)

  useEffect(() => { fetchClients() }, [])

  useRealtime('profiles', {}, (payload) => {
    if (payload.new?.role === 'client') {
      if (payload.eventType === 'INSERT') setClients(prev => [payload.new, ...prev])
      if (payload.eventType === 'UPDATE') setClients(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c))
    }
    if (payload.eventType === 'DELETE' && payload.old) setClients(prev => prev.filter(c => c.id !== payload.old.id))
  })

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, avatar_url, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false })
    // Fetch last-visit data from transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('client_id, created_at')
      .order('created_at', { ascending: false })

    // Build a map: clientId → { lastVisit, visitCount }
    const visitMap = {}
    for (const t of (txns || [])) {
      if (!visitMap[t.client_id]) {
        visitMap[t.client_id] = { lastVisit: t.created_at, count: 0 }
      }
      visitMap[t.client_id].count++
    }

    setClients((data || []).map(c => ({
      ...c,
      _lastVisit: visitMap[c.id]?.lastVisit || null,
      _visitCount: visitMap[c.id]?.count || 0,
    })))
    setLoading(false)
  }

  async function handleDelete(client) {
    const confirmed = await askConfirm({
      title: 'حذف حساب العميل',
      message: `هل أنت متأكد من رغبتك في حذف حساب "${client.name}" نهائياً؟\nلا يمكن التراجع عن هذه الخطوة.`,
      confirmText: 'نعم، حذف الحساب',
      cancelText: 'إلغاء',
      type: 'danger',
    })
    if (!confirmed) return
    const { error } = await adminDeleteUser(client.id)
    if (error) { alert(error); return }
    setClients(prev => prev.filter(c => c.id !== client.id))
  }

  function onUpdated(updated) {
    setClients(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setSheet(null)
  }

  const searched = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const filtered = searched.filter(c => {
    if (filter === 'booked')    return c._booked
    if (filter === 'notbooked') return !c._booked
    return true
  })

  return (
    <div className="clients-page">
      <div className="page-header">
        <h2 className="page-title">العملاء</h2>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
          <span className="clients-count">{clients.length} عملاء</span>
          <button className="add-btn" style={{ fontSize:'0.78rem', padding:'0.4rem 0.8rem' }}
            onClick={() => setSheet({ type: 'add' })}>
            <PlusIcon /> إضافة عميل
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <SearchIcon />
        <input className="search-input" placeholder="ابحث بالاسم أو الهاتف..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filter pills */}
      <div className="cl-filter-row">
        {[['all','الكل'],['booked','محجوز'],['notbooked','غير محجوز']].map(([val, label]) => (
          <button key={val} className={`cl-filter-pill ${filter === val ? 'active' : ''}`}
            onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><div className="app-spinner" style={{ width: 32, height: 32 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <UsersIconLg />
          <p>{search ? 'لا توجد نتائج' : 'لا يوجد عملاء مسجلون بعد'}</p>
        </div>
      ) : (
        <>
          {filtered.map(c => (
            <ClientCard key={c.id} client={c}
              onTap={() => setSheet({ type: 'edit', client: c })}
              onDelete={() => handleDelete(c)} />
          ))}
          <p className="cl-hint">اسحب البطاقة لحذف العميل · اضغط لعرض التفاصيل</p>
        </>
      )}

      {sheet?.type === 'edit' && (
        <ClientSheet client={sheet.client} onClose={() => setSheet(null)} onUpdated={onUpdated} />
      )}
      {sheet?.type === 'add' && (
        <AddClientSheet
          onClose={() => setSheet(null)}
          onAdded={(newClient) => {
            setClients(prev => [newClient, ...prev])
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}

function ClientCard({ client, onTap, onDelete }) {
  const [booked, setBooked] = useState(false)
  const initial = client.name?.trim()[0]?.toUpperCase() || '?'

  useEffect(() => { checkBooking() }, [])

  async function checkBooking() {
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString())
    setBooked(count > 0)
    // Update parent with booked status so filter works
    client._booked = count > 0
  }

  function formatLastVisit(iso) {
    if (!iso) return 'لا زيارات بعد'
    const d = new Date(iso)
    return `آخر زيارة ${d.getDate()} ${['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][d.getMonth()]}`
  }

  return (
    <div className="cl-card" onClick={onTap}>
      {/* Right: avatar */}
      <div className="cl-avatar" style={{ overflow: 'hidden' }}>
        {client.avatar_url ? (
          <img src={client.avatar_url} alt={client.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initial
        )}
      </div>

      {/* Center: info */}
      <div className="cl-info">
        <span className="cl-name">{client.name}</span>
        <span className="cl-phone" dir="ltr">{client.phone}</span>
        <span className="cl-visit">
          {formatLastVisit(client._lastVisit)}
          {client._visitCount > 0 && ` · ${client._visitCount} زيارات`}
        </span>
      </div>

      {/* Left: badge + arrow */}
      <div className="cl-left">
        <span className={`cl-badge ${booked ? 'booked' : 'free'}`}>
          {booked ? 'محجوز ✓' : 'غير محجوز'}
        </span>
        <span className="cl-arrow">‹</span>
      </div>
    </div>
  )
}

function ClientSheet({ client, onClose, onUpdated }) {
  const { askConfirm } = useConfirm()
  const [name, setName]         = useState(client.name || '')
  const [password, setPassword] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError('أدخل الاسم'); return }
    if (password.length > 0 && password.length < 6) { setError('كلمة المرور 6 أحرف على الأقل'); return }

    const ok = await askConfirm({
      title: 'حفظ تعديلات العميل',
      message: `هل أنت متأكد من حفظ التعديلات على حساب "${client.name}"؟`,
      confirmText: 'نعم، حفظ التعديل',
      cancelText: 'إلغاء',
      type: 'warning',
    })
    if (!ok) return

    setSaving(true)
    if (name.trim() !== client.name) {
      const { error: upErr } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', client.id)
      if (upErr) { setError(upErr.message); setSaving(false); return }
    }
    if (password.length >= 6) {
      const { error: pwErr } = await adminUpdatePassword(client.id, password)
      if (pwErr) { setError(pwErr); setSaving(false); return }
    }
    onUpdated({ id: client.id, name: name.trim() })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">تعديل بيانات العميل</div>
        {error && <div className="sheet-error">{error}</div>}
        <div className="sheet-field">
          <label className="sheet-label">الاسم</label>
          <input className="sheet-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="sheet-field">
          <label className="sheet-label">رقم الهاتف</label>
          <input className="sheet-input" value={client.phone} disabled style={{ opacity: 0.4 }} dir="ltr" />
        </div>
        <div className="sheet-field">
          <label className="sheet-label">كلمة المرور الجديدة (اختياري)</label>
          <input className="sheet-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={handleSave} disabled={saving}>
            {saving ? <span className="btn-spinner" /> : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddClientSheet({ onClose, onAdded }) {
  const { askConfirm } = useConfirm()
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleAdd() {
    setError('')
    if (!name.trim())          { setError('أدخل الاسم'); return }
    if (!phone.trim())         { setError('أدخل رقم الهاتف'); return }
    if (password.length < 6)   { setError('كلمة المرور 6 أحرف على الأقل'); return }

    const ok = await askConfirm({
      title: 'إضافة عميل جديد',
      message: `هل أنت متأكد من إنشاء حساب جديد للعميل "${name.trim()}" برقم الهاتف ${phone.trim()}؟`,
      confirmText: 'نعم، إضافة العميل',
      cancelText: 'تراجع',
      type: 'warning',
    })
    if (!ok) return

    setSaving(true)

    const { user: authUser, error: createErr } = await adminCreateUser({
      phone: phone.trim(),
      password,
      name: name.trim(),
      role: 'client',
    })
    if (createErr) { setError(createErr); setSaving(false); return }

    // Wait for trigger to create profile
    await new Promise(r => setTimeout(r, 700))
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, phone, created_at')
      .eq('id', authUser.id)
      .single()

    onAdded(profile || { id: authUser.id, name: name.trim(), phone: phone.trim(), created_at: new Date().toISOString() })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="sheet-handle" />
        <div className="sheet-title">إضافة عميل جديد</div>
        {error && <div className="sheet-error">{error}</div>}
        <div className="sheet-field">
          <label className="sheet-label">الاسم *</label>
          <input className="sheet-input" placeholder="اسم العميل" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="sheet-field">
          <label className="sheet-label">رقم الهاتف *</label>
          <input className="sheet-input" placeholder="01xxxxxxxxx" value={phone}
            onChange={e => setPhone(e.target.value)} type="tel" inputMode="numeric"
            dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="sheet-field">
          <label className="sheet-label">كلمة المرور *</label>
          <input className="sheet-input" placeholder="6 أحرف على الأقل" type="password"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="sheet-cancel" onClick={onClose}>إلغاء</button>
          <button className="sheet-save" onClick={handleAdd} disabled={saving}>
            {saving ? <span className="btn-spinner" /> : 'إنشاء الحساب'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{width:14,height:14}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function UsersIconLg() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, opacity: 0.2 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
