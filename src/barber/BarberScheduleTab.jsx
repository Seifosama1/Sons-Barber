import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { serviceSelect } from '../lib/serviceDb'
import { useRealtime } from '../lib/useRealtime'

export default function BarberScheduleTab({ user }) {
  const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const [days] = useState(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i)
      return d
    })
  )
  const [selDay, setSelDay] = useState(days[0])
  const [appts, setAppts] = useState([])
  const [daysWithAppts, setDaysWithAppts] = useState(new Set())
  const [shopHours, setShopHours] = useState({ open: '09:00', close: '22:00', isOpen: true })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchShopSettings()
    fetchWeekApptsOverview()
  }, [user?.id])

  useEffect(() => {
    if (user?.id) fetchAppts()
  }, [user?.id, selDay])

  useRealtime('appointments', {}, () => {
    fetchWeekApptsOverview()
    fetchAppts()
  })

  async function fetchWeekApptsOverview() {
    if (!user?.id) return
    const start = new Date(days[0])
    start.setHours(0, 0, 0, 0)
    const end = new Date(days[days.length - 1])
    end.setHours(23, 59, 59, 999)

    const { data } = await serviceSelect(
      `appointments?select=scheduled_at,status&barber_id=eq.${user.id}&status=in.(confirmed,pending)&scheduled_at=gte.${start.toISOString()}&scheduled_at=lte.${end.toISOString()}`
    )

    if (data) {
      const set = new Set()
      data.forEach(a => {
        if (a.scheduled_at) {
          const dayStr = new Date(a.scheduled_at).toDateString()
          set.add(dayStr)
        }
      })
      setDaysWithAppts(set)
    }
  }

  async function fetchShopSettings() {
    const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).single()
    if (data) {
      setShopHours({
        open: data.open_time?.slice(0, 5) || '09:00',
        close: data.close_time?.slice(0, 5) || '22:00',
        isOpen: data.is_open ?? true,
      })
    }
  }

  async function fetchAppts() {
    setLoading(true)
    const start = new Date(selDay)
    start.setHours(0, 0, 0, 0)
    const end = new Date(selDay)
    end.setHours(23, 59, 59, 999)

    const { data } = await serviceSelect(
      `appointments?select=id,scheduled_at,status,client:client_id(name,phone,avatar_url),services(name)&barber_id=eq.${user.id}&status=in.(confirmed,pending)&scheduled_at=gte.${start.toISOString()}&scheduled_at=lte.${end.toISOString()}&order=scheduled_at.asc`
    )

    setAppts(data || [])
    setLoading(false)
  }

  function formatTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  return (
    <div className="bs-container">
      {/* Header */}
      <div className="bs-header">
        <h1 className="bs-title">جدولي</h1>
        <span className="bs-readonly-pill">عرض فقط</span>
      </div>

      {/* Shop Hours Card */}
      <div className="bs-shop-card">
        <div className="bs-shop-status">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ecc71', display: 'inline-block' }} />
          <span>المحل مفتوح</span>
        </div>
        <div className="bs-shop-hours">
          {shopHours.open} ~ {shopHours.close}
        </div>
      </div>

      {/* Horizontal Week Strip */}
      <div className="bs-week-strip">
        {days.map((d, i) => {
          const isSel = d.toDateString() === selDay.toDateString()
          const hasAppt = daysWithAppts.has(d.toDateString())
          return (
            <button
              key={i}
              className={`bs-day-pill ${isSel ? 'active' : ''}`}
              onClick={() => setSelDay(d)}
              style={{ position: 'relative' }}
            >
              <span className="bs-day-name">{DAYS_AR[d.getDay()]}</span>
              <span className="bs-day-num">{d.getDate()}</span>
              {hasAppt && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#ef4444',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
                  }}
                  title="يوجد حجوزات"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Bookings Section */}
      <div className="bs-section-title">حجوزات اليوم</div>

      {loading ? (
        <div className="empty-state" style={{ padding: '2rem 0' }}>
          <div className="app-spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : appts.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem 0', color: '#666', textAlign: 'center' }}>
          <p>لا توجد حجوزات في هذا اليوم</p>
        </div>
      ) : (
        <div className="bs-appts-list">
          {appts.map((a, idx) => (
            <div key={a.id} className={`bs-appt-card ${idx === 0 ? 'active-slot' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                {/* Client Avatar */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--gold, #c9a84c), #8b6914)',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid rgba(201, 168, 76, 0.4)',
                  }}
                >
                  {a.client?.avatar_url ? (
                    <img
                      src={a.client.avatar_url}
                      alt={a.client.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    a.client?.name?.[0]?.toUpperCase() || 'ع'
                  )}
                </div>

                {/* Client Details */}
                <div className="bs-appt-info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="bs-appt-name">{a.client?.name || 'عميل'}</span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        background: a.status === 'confirmed' ? 'rgba(46, 204, 113, 0.15)' : 'rgba(201, 168, 76, 0.15)',
                        color: a.status === 'confirmed' ? '#2ecc71' : 'var(--gold, #c9a84c)',
                        fontWeight: 700,
                      }}
                    >
                      {a.status === 'confirmed' ? 'مؤكد' : 'معلق'}
                    </span>
                  </div>

                  {a.client?.phone && (
                    <div style={{ fontSize: '0.78rem', color: '#aaa', direction: 'ltr', textAlign: 'right' }}>
                      {a.client.phone}
                    </div>
                  )}

                  <span className="bs-appt-service">{a.services?.name || 'حلاقة'}</span>
                </div>
              </div>

              {/* Appointment Time */}
              <div className="bs-appt-time" style={{ paddingLeft: '0.5rem', flexShrink: 0 }}>
                {formatTime(a.scheduled_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bs-footer-note">
        الجدول يتم تعديله من الإدارة فقط
      </div>
    </div>
  )
}
