import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'
import { notifyBarberQueueJoin } from '../lib/usePushNotifications'
import Toast from '../components/Toast'
import { ClientWaitlistSkeleton } from '../components/ClientSkeletons'

export default function ClientWaitlist({ user }) {
  const { t } = useLang()
  const [barbers, setBarbers]         = useState([])
  const [waitlistMap, setWaitlistMap] = useState({})
  const [loading, setLoading]         = useState(true)
  const [joining, setJoining]         = useState(null)
  const [toast, setToast]             = useState(null)

  // Keep a ref to the latest map so realtime callback always reads fresh data
  const mapRef = useRef({})

  useEffect(() => { fetchAll() }, [])

  // Realtime — any waitlist or barber profile change → refetch everything
  useRealtime('waitlist',  {}, () => fetchAll())
  useRealtime('profiles',  {}, () => fetchAll())

  async function fetchAll() {
    const { data: barberData } = await supabase
      .from('profiles')
      .select('id, name, is_active, avatar_url, on_seat_client_id')
      .eq('role', 'barber')
      .order('created_at')

    if (!barberData) return
    setBarbers(barberData)

    const map = {}
    await Promise.all(barberData.map(async b => {
      // Fetch waiting entries ordered by joined_at to determine queue position
      const { data: waitingEntries } = await supabase
        .from('waitlist')
        .select('id, client_id, joined_at')
        .eq('barber_id', b.id)
        .eq('status', 'waiting')
        .order('joined_at', { ascending: true })

      const waitingCount = waitingEntries?.length || 0

      // Check if THIS user is already in queue (waiting OR in_service)
      const { data: myEntry } = await supabase
        .from('waitlist')
        .select('id, status, joined_at')
        .eq('barber_id', b.id)
        .eq('client_id', user.id)
        .in('status', ['waiting', 'in_service'])
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Calculate my position in the waiting list (0-indexed)
      let myQueueIndex = -1
      if (myEntry?.status === 'waiting' && waitingEntries) {
        myQueueIndex = waitingEntries.findIndex(e => e.id === myEntry.id || e.client_id === user.id)
      }

      map[b.id] = {
        waiting:      waitingCount,
        onSeat:       !!b.on_seat_client_id,
        myEntry:      myEntry || null,
        myQueueIndex: myQueueIndex,
      }
    }))

    mapRef.current = map
    setWaitlistMap(map)
    setLoading(false)
  }

  async function joinWaitlist(barber) {
    setJoining(barber.id)

    // Read state BEFORE insert to decide the right toast
    const info = mapRef.current[barber.id] || { waiting: 0, onSeat: false }

    const { error } = await supabase.from('waitlist').insert({
      barber_id: barber.id,
      client_id: user.id,
      status:    'waiting',
    })

    setJoining(null)

    if (error) {
      setToast({ msg: t('toastError'), type: 'error' })
      return
    }

    // Notify barber via push (non-blocking — fires and forgets)
    const newCount = (info.waiting || 0) + 1
    notifyBarberQueueJoin({
      barberId:   barber.id,
      clientName: user.name || 'عميل',
      queueCount: newCount,
    })

    // Pick the right toast based on queue state at the moment of joining
    if (!info.onSeat && info.waiting === 0) {
      setToast({ msg: t('toastRegistered'), type: 'success' })
    } else if (info.onSeat && info.waiting === 0) {
      setToast({ msg: t('toastYouNext'), type: 'info' })
    } else {
      setToast({ msg: t('toastWillNotify'), type: 'default' })
    }

    fetchAll()
  }

  async function leaveWaitlist(entryId) {
    await supabase.from('waitlist').update({ status: 'left' }).eq('id', entryId)
    fetchAll()
  }

  // Badge shown on the barber card
  function getBadge(info) {
    if (!info) return null
    const { waiting, onSeat, myEntry, myQueueIndex } = info

    // If THIS client is in the queue
    if (myEntry?.status === 'waiting') {
      // If barber has no one on chair and this client is #1 in line -> "دورك الآن!"
      if (!onSeat && myQueueIndex === 0) {
        return { label: t('badgeYourTurnNow'), cls: 'free' }
      }
      // If barber has 1 on chair and this client is #1 in waiting queue -> "أنت التالي في الدور"
      if (onSeat && myQueueIndex === 0) {
        return { label: t('badgeNextInTurn'), cls: 'waiting' }
      }
    }

    // Default general badges for other viewers
    if (!onSeat && waiting === 0) return { label: t('badgeFree'),    cls: 'free' }
    if (!onSeat && waiting === 1) return { label: t('badgeOnWay'),   cls: 'waiting' }
    if (!onSeat && waiting > 1)   return null
    if (onSeat && waiting === 0)  return { label: t('badgeOnChair'), cls: 'one' }
    return null
  }

  if (loading) return <ClientWaitlistSkeleton />

  return (
    <div className="cw-page">
      <div className="cw-header">
        <h2 className="cw-title">{t('waitlistTitle')}</h2>
        <p className="cw-sub">{t('waitlistSub')}</p>
      </div>

      {barbers.length === 0 ? (
        <div className="empty-state">
          <ScissorsIconLg />
          <p>{t('noBarbers')}</p>
        </div>
      ) : (
        barbers.map(b => {
          const info      = waitlistMap[b.id]
          const badge     = getBadge(info)
          const myEntry   = info?.myEntry
          const inMyQueue = myEntry?.status === 'waiting'
          const onChair   = myEntry?.status === 'in_service'
          const isActive  = b.is_active

          return (
            <div key={b.id} className={`cw-barber-card ${!isActive ? 'inactive' : ''}`}>
              <div className="cw-barber-top">
                <div className="cw-barber-avatar" style={{ overflow: 'hidden' }}>
                  {b.avatar_url ? (
                    <img src={b.avatar_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    b.name[0]
                  )}
                </div>
                <div className="cw-barber-info">
                  <span className="cw-barber-name">{b.name}</span>
                  {badge && (
                    <span className={`cw-queue-badge ${badge.cls}`}>{badge.label}</span>
                  )}
                </div>
                {!isActive && <span className="cw-inactive-tag">{t('badgeInactive')}</span>}
              </div>

              {isActive && (
                onChair ? (
                  <div className="cw-on-chair-banner">{t('onChairBanner')}</div>
                ) : inMyQueue ? (
                  <button className="cw-leave-btn" onClick={() => leaveWaitlist(info.myEntry.id)}>
                    {t('leaveQueue')}
                  </button>
                ) : (
                  <button className="cw-join-btn" disabled={joining === b.id} onClick={() => joinWaitlist(b)}>
                    {joining === b.id
                      ? <span className="btn-spinner" style={{ width: 18, height: 18 }} />
                      : t('joinQueue')}
                  </button>
                )
              )}
            </div>
          )
        })
      )}

      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type === 'info' ? 'success' : toast.type}
          duration={toast.type === 'info' ? 4000 : 3000}
          onDone={() => setToast(null)}
          gold={toast.type === 'info'}
        />
      )}
    </div>
  )
}

function ScissorsIconLg() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, opacity: 0.2 }}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
}
