import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'

const DAYS_AR   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const MONTHS_AR = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function getNext14Days() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + (i === 0 ? 1 : i)); return d
  })
}

export default function BookingSheet({ user, onClose, onBooked }) {
  const [step, setStep]           = useState(1) // 1=barber 2=date 3=time 4=service 5=deposit
  const [barbers, setBarbers]     = useState([])
  const [services, setServices]   = useState([])
  const [selBarber, setSelBarber] = useState(null)
  const [selDate, setSelDate]     = useState(null)
  const [selHour, setSelHour]     = useState(null)
  const [selService, setSelService] = useState(null)
  const [takenHours, setTakenHours] = useState([])
  const [shopHours, setShopHours] = useState({ open: 9, close: 22 })
  const [receipt, setReceipt]     = useState(null) // File
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const days = getNext14Days()

  useEffect(() => {
    fetchBarbers()
    fetchServices()
    fetchShopHours()
  }, [])

  // Live discount/price updates — if admin changes a service while booking sheet is open
  useRealtime('services', {}, () => fetchServices())

  useEffect(() => {
    if (selBarber && selDate) fetchTakenHours()
  }, [selBarber, selDate])

  async function fetchBarbers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, is_active')
      .eq('role', 'barber')
      .eq('is_active', true)
    setBarbers(data || [])
  }

  async function fetchServices() {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, deposit_amount, duration, discount_pct')
      .eq('is_active', true)
      .order('price')
    setServices(data || [])
  }

  async function fetchShopHours() {
    const { data } = await supabase.from('shop_settings').select('open_time,close_time').eq('id',1).single()
    if (data) setShopHours({
      open:  parseInt(data.open_time?.split(':')[0]  || '9'),
      close: parseInt(data.close_time?.split(':')[0] || '22'),
    })
  }

  async function fetchTakenHours() {
    const start = new Date(selDate); start.setHours(0,0,0,0)
    const end   = new Date(selDate); end.setHours(23,59,59,999)
    const { data } = await supabase
      .from('appointments')
      .select('scheduled_at')
      .eq('barber_id', selBarber.id)
      .in('status', ['pending','confirmed'])
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
    setTakenHours((data || []).map(a => new Date(a.scheduled_at).getHours()))
  }

  function handleReceiptChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setReceipt(file)
    setReceiptPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (!selBarber || !selDate || selHour === null || !selService || !receipt) {
      setError('من فضلك أكمل جميع الخطوات وأرفق إيصال الدفع'); return
    }
    setSaving(true); setError('')

    // Upload receipt to storage
    const ext = receipt.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('instapay-receipts')
      .upload(path, receipt, { upsert: true })
    if (uploadErr) { setError('فشل رفع الإيصال: ' + uploadErr.message); setSaving(false); return }

    // Build scheduled_at
    const scheduled = new Date(selDate)
    scheduled.setHours(selHour, 0, 0, 0)

    const { error: apptErr } = await supabase.from('appointments').insert({
      client_id:          user.id,
      barber_id:          selBarber.id,
      service_id:         selService.id,
      scheduled_at:       scheduled.toISOString(),
      status:             'pending',
      instapay_image_url: path,
      deposit_amount:     selService.deposit_amount || 50,
      notes:              notes.trim() || null,
    })

    if (apptErr) { setError(apptErr.message); setSaving(false); return }
    onBooked()
  }

  const availableHours = Array.from(
    { length: shopHours.close - shopHours.open },
    (_, i) => shopHours.open + i
  ).filter(h => !takenHours.includes(h))

  function formatHour(h) {
    if (h === 0) return '12:00 ص'
    if (h < 12) return `${h}:00 ص`
    if (h === 12) return '12:00 م'
    return `${h-12}:00 م`
  }

  const deposit = selService?.deposit_amount || 50

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet booking-sheet">
        <div className="sheet-handle" />

        {/* Step indicator */}
        <div className="booking-steps">
          {[1,2,3,4,5].map(s => (
            <div key={s} className={`booking-step-dot ${step >= s ? 'done' : ''} ${step === s ? 'active' : ''}`} />
          ))}
        </div>

        {/* STEP 1: Select barber */}
        {step === 1 && (
          <div className="booking-step-content">
            <div className="booking-step-title">اختر الحلاق</div>
            <div className="booking-barber-list">
              {barbers.map(b => (
                <button
                  key={b.id}
                  className={`booking-barber-btn ${selBarber?.id === b.id ? 'selected' : ''}`}
                  onClick={() => setSelBarber(b)}
                >
                  <div className="booking-barber-avatar">{b.name[0]}</div>
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
            <button className="booking-next-btn" disabled={!selBarber} onClick={() => setStep(2)}>
              التالي ←
            </button>
          </div>
        )}

        {/* STEP 2: Select date */}
        {step === 2 && (
          <div className="booking-step-content">
            <div className="booking-step-title">اختر التاريخ</div>
            <div className="booking-days-grid">
              {days.map((d, i) => {
                const isSel = selDate?.toDateString() === d.toDateString()
                return (
                  <button
                    key={i}
                    className={`booking-day-btn ${isSel ? 'selected' : ''}`}
                    onClick={() => setSelDate(d)}
                  >
                    <span className="booking-day-name">{DAYS_AR[d.getDay()].slice(0,3)}</span>
                    <span className="booking-day-num">{d.getDate()}</span>
                    <span className="booking-day-month">{MONTHS_AR[d.getMonth()].slice(0,3)}</span>
                  </button>
                )
              })}
            </div>
            <div className="booking-nav">
              <button className="booking-back-btn" onClick={() => setStep(1)}>← السابق</button>
              <button className="booking-next-btn" disabled={!selDate} onClick={() => setStep(3)}>التالي ←</button>
            </div>
          </div>
        )}

        {/* STEP 3: Select time */}
        {step === 3 && (
          <div className="booking-step-content">
            <div className="booking-step-title">
              اختر الوقت
              <span className="booking-step-sub"> — {selDate && `${DAYS_AR[selDate.getDay()]} ${selDate.getDate()} ${MONTHS_AR[selDate.getMonth()]}`}</span>
            </div>
            {availableHours.length === 0 ? (
              <div className="booking-no-slots">لا توجد مواعيد متاحة في هذا اليوم</div>
            ) : (
              <div className="booking-hours-grid">
                {availableHours.map(h => (
                  <button
                    key={h}
                    className={`booking-hour-btn ${selHour === h ? 'selected' : ''}`}
                    onClick={() => setSelHour(h)}
                  >
                    {formatHour(h)}
                  </button>
                ))}
              </div>
            )}
            <div className="booking-nav">
              <button className="booking-back-btn" onClick={() => setStep(2)}>← السابق</button>
              <button className="booking-next-btn" disabled={selHour === null} onClick={() => setStep(4)}>التالي ←</button>
            </div>
          </div>
        )}

        {/* STEP 4: Select service */}
        {step === 4 && (
          <div className="booking-step-content">
            <div className="booking-step-title">اختر الخدمة</div>
            <div className="booking-services-list">
              {services.map(svc => {
                const finalPrice = svc.discount_pct > 0
                  ? Math.round(svc.price * (1 - svc.discount_pct / 100))
                  : svc.price
                return (
                  <button
                    key={svc.id}
                    className={`booking-service-btn ${selService?.id === svc.id ? 'selected' : ''}`}
                    onClick={() => setSelService(svc)}
                  >
                    <div className="bsvc-info">
                      <span className="bsvc-name">{svc.name}</span>
                      <span className="bsvc-duration">{svc.duration} دقيقة</span>
                    </div>
                    <div className="bsvc-price-block">
                      {svc.discount_pct > 0 && <span className="bsvc-old">{svc.price} ج</span>}
                      <span className="bsvc-price">{finalPrice} ج</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="booking-nav">
              <button className="booking-back-btn" onClick={() => setStep(3)}>← السابق</button>
              <button className="booking-next-btn" disabled={!selService} onClick={() => setStep(5)}>التالي ←</button>
            </div>
          </div>
        )}

        {/* STEP 5: Deposit + receipt */}
        {step === 5 && (
          <div className="booking-step-content">
            <div className="booking-step-title">إيداع العربون</div>

            {/* Summary */}
            <div className="booking-summary">
              <div className="bsum-row"><span>الحلاق</span><span>{selBarber?.name}</span></div>
              <div className="bsum-row"><span>الخدمة</span><span>{selService?.name}</span></div>
              <div className="bsum-row"><span>الموعد</span><span>
                {selDate && `${selDate.getDate()} ${MONTHS_AR[selDate.getMonth()]}`} — {formatHour(selHour)}
              </span></div>
              <div className="bsum-row bsum-deposit">
                <span>العربون المطلوب</span>
                <span className="bsum-deposit-val">{deposit} ج.م</span>
              </div>
            </div>

            <div className="booking-instapay-hint">
              <InstapayIcon />
              <span>حوّل العربون عبر InstaPay وارفع لقطة الشاشة هنا</span>
            </div>

            {/* Receipt upload */}
            <label className="receipt-upload-area">
              <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleReceiptChange} />
              {receiptPreview ? (
                <img src={receiptPreview} alt="الإيصال" className="receipt-preview-img" />
              ) : (
                <div className="receipt-upload-placeholder">
                  <UploadIcon />
                  <span>اضغط لرفع صورة الإيصال</span>
                </div>
              )}
            </label>

            {/* Notes */}
            <div className="sheet-field">
              <label className="sheet-label">ملاحظات (اختياري)</label>
              <textarea
                className="sheet-input"
                rows={2}
                placeholder="أي طلبات خاصة؟"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ resize:'none' }}
              />
            </div>

            {error && <div className="sheet-error">{error}</div>}

            <div className="booking-nav">
              <button className="booking-back-btn" onClick={() => setStep(4)}>← السابق</button>
              <button
                className="booking-submit-btn"
                disabled={!receipt || saving}
                onClick={handleSubmit}
              >
                {saving ? <span className="btn-spinner" /> : 'إرسال الطلب ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InstapayIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18,flexShrink:0}}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> }
function UploadIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:32,height:32,opacity:0.4}}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> }
