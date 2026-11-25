import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { serviceSelect } from '../lib/serviceDb'
import { useRealtime } from '../lib/useRealtime'

export default function BarberHomeTab({ user, onNavigateTab }) {
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [chairClient, setChairClient] = useState(null)
  const [nextClient, setNextClient] = useState(null)
  const [todayCuts, setTodayCuts] = useState(0)
  const [ratingVal, setRatingVal] = useState(5.0)
  const [ratingsList, setRatingsList] = useState([])
  const [showAllRatings, setShowAllRatings] = useState(false)
  const [loading, setLoading] = useState(true)

  // Debounce — realtime fires can bunch up; wait 400ms before re-fetching
  const refetchTimer = useRef(null)
  const debouncedFetch = useCallback(() => {
    clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => fetchHomeDataSilent(), 400)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    fetchHomeData()
    return () => clearTimeout(refetchTimer.current)
  }, [user?.id])

  useRealtime('waitlist',       {}, debouncedFetch)
  useRealtime('barber_ratings', {}, debouncedFetch)
  useRealtime('transactions',   {}, debouncedFetch)

  async function fetchHomeData() {
    setLoading(true)
    await _loadHomeData()
    setLoading(false)
  }

  // Silent refresh — used by realtime updates so there's no skeleton flash
  async function fetchHomeDataSilent() {
    await _loadHomeData()
  }

  async function _loadHomeData() {

    // 1. Fetch barber profile info (is_active, rating)
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_active, rating_avg, rating_count, on_seat_client_id')
      .eq('id', user.id)
      .single()
    if (prof) {
      setIsActive(prof.is_active ?? true)
      setRatingVal(prof.rating_avg ? Number(prof.rating_avg.toFixed(1)) : 5.0)
    }

    // 2. Fetch today's cuts count from transactions
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', user.id)
      .gte('created_at', startOfToday.toISOString())
    setTodayCuts(count || 0)

    // 3. Fetch chair and next client from waitlist using serviceSelect to bypass RLS on profiles join
    const { data: queueData } = await serviceSelect(
      `waitlist?select=id,client_id,walk_in_phone,walk_in_name,added_by_admin,status,joined_at,profiles:client_id(name,phone)&barber_id=eq.${user.id}&status=in.(in_service,waiting)&order=joined_at.asc`
    )

    const list = queueData || []
    const onChair = list.find(q => q.status === 'in_service')
    const waitingFirst = list.find(q => q.status === 'waiting')

    const parseEntry = (q) => {
      if (!q) return null
      const isApp = !!q.client_id
      const name = q.profiles?.name || (q.walk_in_name && q.walk_in_name !== 'WAITING_PAYMENT' && q.walk_in_name !== 'عميل بدون تطبيق' ? q.walk_in_name : null) || (q.walk_in_phone ? `عميل (${q.walk_in_phone.slice(-4)})` : (isApp ? 'عميل بالتطبيق' : 'عميل بدون تطبيق'))
      return { id: q.id, name, isApp, added_by_admin: q.added_by_admin, entry: q }
    }

    setChairClient(parseEntry(onChair))
    setNextClient(parseEntry(waitingFirst))

    // 4. Fetch real ratings from barber_ratings (bypass RLS using serviceSelect so client profile name & avatar are fetched)
    try {
      const { data: ratingsData } = await serviceSelect(
        `barber_ratings?select=id,rating,created_at,client:client_id(name,avatar_url)&barber_id=eq.${user.id}&order=created_at.desc&limit=20`
      )
      setRatingsList(ratingsData || [])
    } catch (e) {
      console.warn('Ratings query error:', e)
    }
  }

  async function toggleActive() {
    const nextVal = !isActive
    setIsActive(nextVal)
    await (supabaseAdmin || supabase).from('profiles').update({ is_active: nextVal }).eq('id', user.id)
  }

  async function handleChairAction() {
    // If client currently on chair -> navigate to queue to manage or finish
    if (chairClient) {
      onNavigateTab('queue')
      return
    }

    // If no one on chair and next client exists -> start cutting!
    if (nextClient?.entry?.id) {
      const entryId = nextClient.entry.id
      const clientId = nextClient.entry.client_id || entryId
      await (supabaseAdmin || supabase).from('waitlist').update({ status: 'in_service' }).eq('id', entryId)
      await (supabaseAdmin || supabase).from('profiles').update({ on_seat_client_id: clientId }).eq('id', user.id)
      localStorage.setItem(`chair_start_${user.id}_${entryId}`, Date.now().toString())
      onNavigateTab('queue')
      return
    }

    onNavigateTab('queue')
  }

  const firstName = user?.name?.split(' ')[0] || 'كابتن'
  const latestRating = ratingsList[0] || null

  function formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  return (
    <div className="bh-container">
      {/* Greeting */}
      <div className="bh-greeting">
        <h1 className="bh-greeting-title">
          مساء النور، <span>{firstName}</span>
        </h1>
        <div className="bh-greeting-sub">جاهز ليوم شغل جديد</div>
      </div>

      {/* Available Toggle Card */}
      <div className="bh-avail-card">
        <div className="bh-avail-info">
          <div className="bh-avail-title">
            <span className={`bh-avail-dot ${isActive ? 'on' : 'off'}`} />
            {isActive ? 'متاح للعملاء' : 'في استراحة (غير متاح)'}
          </div>
          <div className="bh-avail-sub">
            {isActive ? 'العملاء يمكنهم الانضمام لطابورك' : 'أوقف الاستقبال عند أخذ استراحة'}
          </div>
        </div>
        <label className="bh-switch">
          <input type="checkbox" checked={isActive} onChange={toggleActive} />
          <span className="bh-slider" />
        </label>
      </div>

      {/* Next Client / Active Chair Card */}
      <div className={`bh-next-card ${chairClient ? 'chair-active' : ''}`}>
        <div className="bh-next-label">
          {chairClient ? 'على الكرسي الآن' : 'العميل التالي'}
        </div>
        <div className="bh-next-row">
          <span className="bh-next-name">
            {chairClient
              ? chairClient.name
              : (nextClient ? nextClient.name : 'لا يوجد أحد بالانتظار')}
          </span>
          {chairClient ? (
            <span className="bh-next-badge on-chair">
              {chairClient.isApp ? 'تطبيق' : 'حضور مباشر'}
            </span>
          ) : (
            nextClient && (
              <span className="bh-next-badge">
                {nextClient.isApp ? 'تطبيق' : 'حضوري'}
              </span>
            )
          )}
        </div>
        <button
          className={`bh-next-btn ${chairClient ? 'bh-btn-chair-active' : ''}`}
          onClick={handleChairAction}
          disabled={!chairClient && !nextClient}
          style={{ opacity: (chairClient || nextClient) ? 1 : 0.6 }}
        >
          {chairClient ? 'متابعة الجلسة في الطابور' : 'ابدأ القص'}
        </button>
      </div>

      {/* 3 Stats Chips */}
      <div className="bh-stats-row">
        <div className="bh-stat-card">
          <span className="bh-stat-val">{todayCuts}</span>
          <span className="bh-stat-label">قصات اليوم</span>
        </div>
        <div className="bh-stat-card">
          <span className="bh-stat-val">28د</span>
          <span className="bh-stat-label">متوسط الوقت</span>
        </div>
        <div className="bh-stat-card">
          <span className="bh-stat-val">{ratingVal.toFixed(1)}</span>
          <span className="bh-stat-label">التقييم</span>
        </div>
      </div>

      {/* 2 Action Buttons */}
      <div className="bh-actions-row">
        <button className="bh-action-btn" onClick={() => onNavigateTab('queue', { openAdd: true })}>
          + إضافة عميل
        </button>
        <button className="bh-action-btn" onClick={() => onNavigateTab('profile', { openAddPost: true })}>
          + منشور جديد
        </button>
      </div>

      {/* Real Ratings Rectangular Section */}
      <div className="bh-ratings-section">
        <div className="bh-ratings-hdr">
          <div className="bh-ratings-title-row">
            <span className="bh-ratings-title">تقييمات العملاء</span>
            <span className="bh-ratings-count">({ratingsList.length} تقييم)</span>
          </div>
          {ratingsList.length > 1 && (
            <button
              className="bh-view-more-btn"
              onClick={() => setShowAllRatings(!showAllRatings)}
            >
              {showAllRatings ? 'عرض أقل ↑' : 'عرض الكل ↓'}
            </button>
          )}
        </div>

        {ratingsList.length === 0 ? (
          <div className="bh-rating-empty">
            لا توجد تقييمات مسجلة بعد لهذا الحساب.
          </div>
        ) : (
          <div className="bh-ratings-list">
            {(showAllRatings ? ratingsList : [latestRating]).map((r) => (
              <div key={r.id} className="bh-rating-item">
                <div className="bh-rating-item-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--gold), #8b6914)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}
                    >
                      {r.client?.avatar_url ? (
                        <img src={r.client.avatar_url} alt={r.client.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        r.client?.name?.[0] || 'ع'
                      )}
                    </div>
                    <span className="bh-rating-client-name">
                      {r.client?.name || 'عميل'}
                    </span>
                  </div>
                  <div className="bh-rating-stars-row">
                    <span className="bh-rating-stars" style={{ display: 'inline-flex', gap: 2 }}>
                      {[...Array(r.rating || 5)].map((_, i) => (
                        <svg key={i} viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="#c9a84c" stroke="#c9a84c" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      ))}
                    </span>
                    <span className="bh-rating-date">{formatDate(r.created_at)}</span>
                  </div>
                </div>
                {r.comment ? (
                  <p className="bh-rating-comment">"{r.comment}"</p>
                ) : (
                  <p className="bh-rating-comment muted">
                    (تقييم {r.rating} نجوم بدون تعليق مكتوب)
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
