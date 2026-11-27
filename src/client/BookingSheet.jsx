import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useConfirm } from '../context/ConfirmContext'
import { useLang } from '../context/LanguageContext'

function getNext14Days() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + (i === 0 ? 1 : i)); return d
  })
}

export default function BookingSheet({ user, onClose, onBooked }) {
  const { askConfirm } = useConfirm()
  const { t, lang } = useLang()
  const [step, setStep]           = useState(1) // 1=barber 2=date 3=time 4=service 5=deposit
  const [slideDir, setSlideDir]   = useState('forward') // 'forward' | 'backward'
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

  const daysArr = t('days') || ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
  const monthsArr = t('months') || ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  function goToStep(nextStep) {
    setSlideDir(nextStep > step ? 'forward' : 'backward')
    setStep(nextStep)
  }

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
      .select('id, name, is_active, avatar_url')
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

  function formatHour(h) {
    const isEn = lang === 'en'
    if (h === 0) return isEn ? '12:00 AM' : '12:00 ص'
    if (h < 12) return isEn ? `${h}:00 AM` : `${h}:00 ص`
    if (h === 12) return isEn ? '12:00 PM' : '12:00 م'
    return isEn ? `${h-12}:00 PM` : `${h-12}:00 م`
  }

  async function handleSubmit() {
    if (!selBarber || !selDate || selHour === null || !selService || !receipt) {
      setError(t('errCompleteSteps'))
      return
    }

    const dateStr = selDate ? `${selDate.getDate()} ${monthsArr[selDate.getMonth()]}` : ''
    const hourStr = formatHour(selHour)

    const ok = await askConfirm({
      title: t('confirmBookingTitle'),
      message: t('confirmBookingMsg', {
        barber: selBarber?.name,
        service: selService?.name,
        dateTime: `${dateStr} ${hourStr}`,
        deposit: `${deposit} ${t('currencyEg')}`,
      }),
      confirmText: t('confirmBookingYes'),
      cancelText: t('confirmBookingReview'),
      type: 'warning',
    })

    if (!ok) return

    setSaving(true); setError('')

    // Upload receipt to storage
    const ext = receipt.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('instapay-receipts')
      .upload(path, receipt, { upsert: true })
    if (uploadErr) { setError(t('errUploadFailed') + ': ' + uploadErr.message); setSaving(false); return }

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

        <div className="booking-step-wrapper">
          {/* STEP 1: Select barber */}
          {step === 1 && (
            <div key="step1" className={`booking-step-content slide-${slideDir}`}>
              <div className="booking-step-title">{t('stepBarber')}</div>
              <div className="booking-barber-list">
                {barbers.map(b => (
                  <button
                    key={b.id}
                    className={`booking-barber-btn ${selBarber?.id === b.id ? 'selected' : ''}`}
                    onClick={() => setSelBarber(b)}
                  >
                    <div className="booking-barber-avatar" style={{ overflow: 'hidden' }}>
                      {b.avatar_url ? (
                        <img src={b.avatar_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        b.name[0]
                      )}
                    </div>
                    <span>{b.name}</span>
                  </button>
                ))}
              </div>
              <button className="booking-next-btn" disabled={!selBarber} onClick={() => goToStep(2)}>
                {t('nextBtn')}
              </button>
            </div>
          )}

          {/* STEP 2: Select date */}
          {step === 2 && (
            <div key="step2" className={`booking-step-content slide-${slideDir}`}>
              <div className="booking-step-title">{t('stepDate')}</div>
              <div className="booking-days-grid">
                {days.map((d, i) => {
                  const isSel = selDate?.toDateString() === d.toDateString()
                  return (
                    <button
                      key={i}
                      className={`booking-day-btn ${isSel ? 'selected' : ''}`}
                      onClick={() => setSelDate(d)}
                    >
                      <span className="booking-day-name">{daysArr[d.getDay()].slice(0,3)}</span>
                      <span className="booking-day-num">{d.getDate()}</span>
                      <span className="booking-day-month">{monthsArr[d.getMonth()].slice(0,3)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="booking-nav">
                <button className="booking-back-btn" onClick={() => goToStep(1)}>{t('backBtn')}</button>
                <button className="booking-next-btn" disabled={!selDate} onClick={() => goToStep(3)}>{t('nextBtn')}</button>
              </div>
            </div>
          )}

          {/* STEP 3: Select time */}
          {step === 3 && (
            <div key="step3" className={`booking-step-content slide-${slideDir}`}>
              <div className="booking-step-title">
                {t('stepTime')}
                <span className="booking-step-sub"> — {selDate && `${daysArr[selDate.getDay()]} ${selDate.getDate()} ${monthsArr[selDate.getMonth()]}`}</span>
              </div>
              {availableHours.length === 0 ? (
                <div className="booking-no-slots">{t('noSlots')}</div>
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
                <button className="booking-back-btn" onClick={() => goToStep(2)}>{t('backBtn')}</button>
                <button className="booking-next-btn" disabled={selHour === null} onClick={() => goToStep(4)}>{t('nextBtn')}</button>
              </div>
            </div>
          )}

          {/* STEP 4: Select service */}
          {step === 4 && (
            <div key="step4" className={`booking-step-content slide-${slideDir}`}>
              <div className="booking-step-title">{t('stepService')}</div>
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
                        <span className="bsvc-duration">{svc.duration} {t('min')}</span>
                      </div>
                      <div className="bsvc-price-block">
                        {svc.discount_pct > 0 && <span className="bsvc-old">{svc.price} {t('currencyShort')}</span>}
                        <span className="bsvc-price">{finalPrice} {t('currencyShort')}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="booking-nav">
                <button className="booking-back-btn" onClick={() => goToStep(3)}>{t('backBtn')}</button>
                <button className="booking-next-btn" disabled={!selService} onClick={() => goToStep(5)}>{t('nextBtn')}</button>
              </div>
            </div>
          )}

          {/* STEP 5: Deposit + receipt */}
          {step === 5 && (
            <div key="step5" className={`booking-step-content slide-${slideDir}`}>
              <div className="booking-step-title">{t('stepDeposit')}</div>

              {/* Summary */}
              <div className="booking-summary">
                <div className="bsum-row"><span>{t('barber')}</span><span>{selBarber?.name}</span></div>
                <div className="bsum-row"><span>{t('service')}</span><span>{selService?.name}</span></div>
                <div className="bsum-row"><span>{t('appointment')}</span><span>
                  {selDate && `${selDate.getDate()} ${monthsArr[selDate.getMonth()]}`} — {formatHour(selHour)}
                </span></div>
                <div className="bsum-row bsum-deposit">
                  <span>{t('depositRequired')}</span>
                  <span className="bsum-deposit-val">{deposit} {t('currencyEg')}</span>
                </div>
              </div>

              <div className="booking-instapay-hint" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <InstapayIcon />
                  <span style={{ fontWeight: 600 }}>{t('instapayHint')}</span>
                </div>
                <a
                  href="https://ipn.eg/S/seif.osama33/instapay/6WuhMV"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #c9a84c, #8b6914)',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    padding: '0.65rem 1rem',
                    borderRadius: 10,
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(201, 168, 76, 0.25)',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>{t('instapayDirectLink')}</span>
                </a>
              </div>

              {/* Receipt upload */}
              <label className="receipt-upload-area">
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleReceiptChange} />
                {receiptPreview ? (
                  <img src={receiptPreview} alt={t('uploadReceipt')} className="receipt-preview-img" />
                ) : (
                  <div className="receipt-upload-placeholder">
                    <UploadIcon />
                    <span>{t('uploadReceipt')}</span>
                  </div>
                )}
              </label>

              {/* Notes */}
              <div className="sheet-field">
                <label className="sheet-label">{t('notes')}</label>
                <textarea
                  className="sheet-input"
                  rows={2}
                  placeholder={t('notesPlaceholder')}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize:'none' }}
                />
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <div className="booking-nav">
                <button className="booking-back-btn" onClick={() => goToStep(4)}>{t('backBtn')}</button>
                <button
                  className="booking-submit-btn"
                  disabled={!receipt || saving}
                  onClick={handleSubmit}
                >
                  {saving ? <span className="btn-spinner" /> : t('submitBooking')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InstapayIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18,flexShrink:0}}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> }
function UploadIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:32,height:32,opacity:0.4}}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> }
