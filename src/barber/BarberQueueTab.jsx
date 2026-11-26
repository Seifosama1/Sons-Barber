import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { serviceSelect, serviceUpdate, serviceInsert } from '../lib/serviceDb'
import { useRealtime } from '../lib/useRealtime'
import { useConfirm } from '../context/ConfirmContext'
import { queueTurnText, queueUpdateText } from '../lib/notifText'

export default function BarberQueueTab({ user, initialOpenAdd, onResetInitialOpenAdd }) {
  const { askConfirm } = useConfirm()
  const [queue, setQueue] = useState([])
  const [chairEntry, setChairEntry] = useState(null)
  const [pendingPayment, setPendingPayment] = useState(null)
  const pendingPaymentRef = useRef(null) // Sync ref so fetchQueue always reads current value
  const [elapsedSec, setElapsedSec] = useState(0)
  const [loading, setLoading] = useState(true)
  const isFinishingRef = useRef(false) // Guard against double-finish

  // Notification status
  const [notifSent, setNotifSent] = useState(null) // entryId

  // Swipe to delete & undo state
  const [swipeOffsets, setSwipeOffsets] = useState({}) // entryId -> px
  const dragStartRef = useRef(null) // { id, startX, currentX }
  const [undoItem, setUndoItem] = useState(null) // { entry, timerId, startTime }

  // Drag & drop reorder state
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Add client modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [guestPhone, setGuestPhone] = useState('')
  const [guestName, setGuestName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (initialOpenAdd) {
      setShowAddModal(true)
      if (onResetInitialOpenAdd) onResetInitialOpenAdd()
    }
  }, [initialOpenAdd])

  useEffect(() => {
    if (user?.id) fetchQueue()
  }, [user?.id])

  useRealtime('waitlist', {}, () => {
    fetchQueue()
  })

  // Live timer for chair
  useEffect(() => {
    if (!chairEntry) {
      setElapsedSec(0)
      return
    }
    const storageKey = `chair_start_${user.id}_${chairEntry.id}`
    let startTime = parseInt(localStorage.getItem(storageKey) || '0', 10)
    if (!startTime || isNaN(startTime)) {
      startTime = Date.now()
      localStorage.setItem(storageKey, startTime.toString())
    }

    const updateTimer = () => {
      const now = Date.now()
      const diff = Math.max(0, Math.floor((now - startTime) / 1000))
      setElapsedSec(diff)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [chairEntry?.id, user.id])

  async function fetchQueue() {
    setLoading(true)
    // Use serviceSelect (raw fetch with service key) so profiles:client_id(name, phone, avatar_url) is always returned
    const { data } = await serviceSelect(
      `waitlist?select=id,joined_at,status,client_id,walk_in_phone,walk_in_name,added_by_admin,notified_at,profiles:client_id(name,phone,avatar_url)&barber_id=eq.${user.id}&status=in.(waiting,in_service,done)&order=joined_at.asc`
    )

    const list = data || []
    const pendingId = pendingPaymentRef.current?.id
    const onChair = list.find(e => e.status === 'in_service' && e.id !== pendingId)
    const waitingList = list.filter(e => e.status === 'waiting' && e.id !== pendingId)

    // Sync Slot 3 (Pending Payment) with database
    // Marked by notified_at timestamp (e.g. 2099-01-01) or WAITING_PAYMENT
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

    setChairEntry(onChair || null)
    setQueue(waitingList)
    setLoading(false)
  }

  const displayName = (entry) => {
    if (!entry) return 'عميل'
    // 1. If real name from profile exists
    if (entry?.profiles?.name) return entry.profiles.name
    // 2. If walk-in name exists (and isn't the internal marker)
    if (entry?.walk_in_name && entry.walk_in_name !== 'WAITING_PAYMENT' && entry.walk_in_name !== 'عميل بدون تطبيق') {
      return entry.walk_in_name
    }
    // 3. If phone exists
    if (entry?.walk_in_phone) return `عميل (${entry.walk_in_phone.slice(-4)})`
    // 4. Fallback based on client_id
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

  /* Start session */
  async function startSession(entry) {
    if (chairEntry) {
      await finishSession()
    }
    const now = Date.now()
    localStorage.setItem(`chair_start_${user.id}_${entry.id}`, String(now))
    await serviceUpdate('profiles', { on_seat_client_id: entry.client_id || entry.id }, 'id', user.id)
    await serviceUpdate('waitlist', { status: 'in_service' }, 'id', entry.id)
    fetchQueue()
  }

  /* Finish session -> Move to pendingPayment (heading to cashier) */
  async function finishSession() {
    if (isFinishingRef.current) return // Prevent double-tap race
    const current = chairEntry
    if (!current) return
    isFinishingRef.current = true

    // 1. Immediately update React state so UI reflects change
    setChairEntry(null)
    pendingPaymentRef.current = current
    setPendingPayment(current)

    // 2. Update DB status to 'done' and tag notified_at with future timestamp (2099-01-01) for live cross-portal sync
    // This valid ISO timestamp bypasses timestamptz constraint and syncs perfectly!
    const syncTimestamp = '2099-01-01T00:00:00.000Z'
    await serviceUpdate('waitlist', { status: 'done', notified_at: syncTimestamp }, 'id', current.id)

    // 3. Clear barber's on_seat marker
    await serviceUpdate('profiles', { on_seat_client_id: null }, 'id', user.id)

    // 4. Clear localStorage timer
    localStorage.removeItem(`chair_start_${user.id}_${current.id}`)

    // 5. Refresh queue
    fetchQueue()
    isFinishingRef.current = false
  }

  /* Dismiss finished card after cashier receives them */
  async function dismissPendingPayment() {
    const cur = pendingPaymentRef.current
    if (cur?.id) {
      await serviceUpdate('waitlist', { notified_at: null }, 'id', cur.id)
    }
    pendingPaymentRef.current = null
    setPendingPayment(null)
    fetchQueue()
  }

  /* Send custom queue notification to client */
  async function sendQueueNotification(entry, queueIdx) {
    if (!entry?.client_id) return
    setNotifSent(entry.id)

    let notifTitle, notifBody
    if (queueIdx === 0 && chairEntry) {
      const text = await queueTurnText(entry.client_id, user.name)
      notifTitle = text.title
      notifBody  = text.body
    } else {
      const aheadCount = queueIdx + (chairEntry ? 1 : 0)
      const text = await queueUpdateText(entry.client_id, user.name, aheadCount)
      notifTitle = text.title
      notifBody  = text.body
    }

    await serviceInsert('notifications', {
      target_user_id: entry.client_id,
      title: notifTitle,
      body:  notifBody,
      type:  'next_in_queue',
      is_read: false,
    })

    setTimeout(() => setNotifSent(null), 3000)
  }

  /* Swipe to delete mechanism */
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

    // Immediately remove from local list for smooth feel
    setQueue(prev => prev.filter(e => e.id !== entryId))
    setSwipeOffsets(prev => {
      const copy = { ...prev }
      delete copy[entryId]
      return copy
    })

    if (undoItem?.timerId) {
      clearTimeout(undoItem.timerId)
      supabase.from('waitlist').update({ status: 'left' }).eq('id', undoItem.entry.id)
    }

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
    setQueue(prev => [...prev, undoItem.entry].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at)))
    setUndoItem(null)
  }

  /* Reorder queue via drag and drop */
  async function handleDropReorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx === null || toIdx === null) return
    const updated = [...queue]
    const [moved] = updated.splice(fromIdx, 1)
    updated.splice(toIdx, 0, moved)
    setQueue(updated)
    setDraggedIndex(null)
    setDragOverIndex(null)

    // Calculate monotonic timestamps spaced by 1 minute based on current time
    const baseTime = Date.now() - (updated.length * 60000)
    for (let i = 0; i < updated.length; i++) {
      const newJoinedAt = new Date(baseTime + i * 60000).toISOString()
      updated[i].joined_at = newJoinedAt
      await serviceUpdate('waitlist', { joined_at: newJoinedAt }, 'id', updated[i].id)
    }
  }

  const handlePointerDown = (id, e) => {
    if (e.button !== undefined && e.button !== 0) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    dragStartRef.current = { id, startX: clientX, currentX: clientX }
  }

  const handlePointerMove = (id, e) => {
    if (!dragStartRef.current || dragStartRef.current.id !== id) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const rawDelta = clientX - dragStartRef.current.startX
    // Smooth resistance dragging curve
    if (rawDelta > 0) {
      let damped = rawDelta
      if (rawDelta > 80) {
        // Apply friction after 80px so it feels responsive yet controlled
        damped = 80 + (rawDelta - 80) * 0.55
      }
      setSwipeOffsets(prev => ({ ...prev, [id]: Math.min(damped, 160) }))
    }
  }

  const handlePointerUp = (id) => {
    if (!dragStartRef.current || dragStartRef.current.id !== id) return
    const offset = swipeOffsets[id] || 0
    dragStartRef.current = null

    if (offset > 85) {
      removeFromQueue(id)
    } else {
      setSwipeOffsets(prev => ({ ...prev, [id]: 0 }))
    }
  }

  /* Add client manually */
  async function handleAddClient(e) {
    e.preventDefault()
    setAddError('')
    setAdding(true)

    const payload = {
      barber_id: user.id,
      status: 'waiting',
      added_by_admin: false,
    }

    if (guestPhone.trim()) payload.walk_in_phone = guestPhone.trim()
    if (guestName.trim()) payload.walk_in_name = guestName.trim()
    else if (!guestPhone.trim()) payload.walk_in_name = 'عميل بدون تطبيق'

    const { error: insertErr } = await supabase.from('waitlist').insert(payload)
    setAdding(false)
    if (insertErr) {
      setAddError(insertErr.message)
      return
    }

    setGuestPhone('')
    setGuestName('')
    setShowAddModal(false)
    fetchQueue()
  }

  return (
    <div className="bq-container">
      {/* Header */}
      <div className="bq-header">
        <h1 className="bq-title">طابوري</h1>
        <div className="bq-live-dot">مباشر</div>
      </div>

      {/* Slot 1: On Chair */}
      <div className="bq-slot-card">
        <div className="bq-slot-hdr">
          <div className="bq-slot-title">
            <span className="bq-slot-num">1</span>
            <span>على الكرسي</span>
          </div>
          <span className="bq-slot-badge">{chairEntry ? 1 : 0}</span>
        </div>

        {chairEntry ? (
          <div className="lq-cust-card chair-highlight" style={{ margin: '0.4rem 0' }}>
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
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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
        ) : (
          <div className="lq-empty-box" style={{ margin: '0.4rem 0' }}>الكرسي فارغ · اضغط ابدأ للبدء</div>
        )}

        {chairEntry && (
          <button className="lq-btn-gold-full" onClick={finishSession} style={{ marginTop: 8 }}>
            إنهاء الجلسة
          </button>
        )}
      </div>

      {/* Slot 2: Waiting Queue */}
      <div className="bq-slot-card">
        <div className="bq-slot-hdr">
          <div className="bq-slot-title">
            <span className="bq-slot-num">2</span>
            <span>قائمة الانتظار</span>
          </div>
          <span className="bq-slot-badge">{queue.length}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.2rem' }}>
            <div className="app-spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : queue.length === 0 ? (
          <div className="lq-empty-box">لا أحد في الانتظار</div>
        ) : (
          <div className="lq-cust-list">
            {queue.map((entry, idx) => {
              const isApp = isAppClient(entry)
              const phone = displayPhone(entry)
              const offset = swipeOffsets[entry.id] || 0
              const isOverThreshold = offset > 90

              return (
                <div
                  key={entry.id}
                  className={`lq-swipe-container ${dragOverIndex === idx ? 'drag-over' : ''} ${draggedIndex === idx ? 'is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragOverIndex !== idx) setDragOverIndex(idx)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleDropReorder(draggedIndex, idx)
                  }}
                >
                  {/* Swipe delete background */}
                  <div className={`lq-swipe-bg ${isOverThreshold ? 'over-threshold' : ''}`}>
                    <div className="lq-swipe-bg-content">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span>{isOverThreshold ? 'أفلت للحذف' : 'اسحب للحذف'}</span>
                    </div>
                  </div>

                  {/* Swipable Card */}
                  <div
                    className={`lq-cust-card ${offset > 0 ? 'is-swiping' : ''} ${isOverThreshold ? 'card-delete-alert' : ''}`}
                    style={{
                      transform: `translateX(${offset}px)`,
                      transition: offset === 0 ? 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)' : 'transform 0.05s ease-out',
                      willChange: 'transform',
                    }}
                    onPointerDown={(e) => handlePointerDown(entry.id, e)}
                    onPointerMove={(e) => handlePointerMove(entry.id, e)}
                    onPointerUp={() => handlePointerUp(entry.id)}
                    onPointerCancel={() => handlePointerUp(entry.id)}
                  >
                    <div className="lq-cust-left">
                      {/* Drag Handle Icon */}
                      <div
                        className="lq-drag-handle"
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation()
                          setDraggedIndex(idx)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(idx))
                        }}
                        onDragEnd={() => {
                          setDraggedIndex(null)
                          setDragOverIndex(null)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="اسحب لإعادة الترتيب"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <circle cx="8" cy="5" r="1.8" />
                          <circle cx="16" cy="5" r="1.8" />
                          <circle cx="8" cy="12" r="1.8" />
                          <circle cx="16" cy="12" r="1.8" />
                          <circle cx="8" cy="19" r="1.8" />
                          <circle cx="16" cy="19" r="1.8" />
                        </svg>
                      </div>

                      <div className="lq-cust-avatar-sm" style={{ overflow: 'hidden' }}>
                        {displayAvatar(entry) ? (
                          <img src={displayAvatar(entry)} alt={displayName(entry)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : isApp ? (
                          displayName(entry)[0] || 'ع'
                        ) : (
                          'ح'
                        )}
                      </div>
                      <div className="lq-cust-meta">
                        <div className="lq-cust-name">{displayName(entry)}</div>
                        <div style={{ margin: '3px 0', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="lq-tag waiting">#{idx + 1}</span>
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
                      {!chairEntry && idx === 0 && (
                        <button className="lq-btn-gold-sm" onClick={() => startSession(entry)}>
                          ابدأ
                        </button>
                      )}

                      {/* Bell Notification Button */}
                      {isApp && (
                        <button
                          className={`lq-btn-icon-bell ${notifSent === entry.id ? 'sent' : ''}`}
                          title="إرسال تحديث بالدور للعميل"
                          onClick={() => sendQueueNotification(entry, idx)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button className="bq-add-client-full" onClick={() => setShowAddModal(true)}>
          + إضافة عميل للقائمة
        </button>
      </div>

      {/* Slot 3: Finished & Heading to Cashier */}
      <div className="bq-slot-card">
        <div className="bq-slot-hdr">
          <div className="bq-slot-title">
            <span className="bq-slot-num">3</span>
            <span>في انتظار الدفع</span>
          </div>
          <span className="bq-slot-badge">{pendingPayment ? 1 : 0}</span>
        </div>

        {pendingPayment ? (
          <div className="lq-cust-card pay-highlight" style={{ margin: '0.4rem 0' }}>
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
          </div>
        ) : (
          <div className="lq-empty-box" style={{ margin: '0.4rem 0' }}>لا يوجد عميل متجه للكاشير حالياً</div>
        )}
      </div>

      {/* Undo Delete Toast */}
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

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="bp-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 400, width: '92%', background: '#121212', borderRadius: 20, padding: '1.2rem', border: '1px solid #282828' }}>
            <div className="sheet-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '1rem', textAlign: 'center' }}>
              إضافة عميل إلى طابورك
            </div>

            {addError && (
              <div style={{ color: '#e74c3c', fontSize: '0.8rem', marginBottom: '0.8rem', textAlign: 'center' }}>
                {addError}
              </div>
            )}

            <form onSubmit={handleAddClient} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  اسم العميل (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: كريم حسن"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  رقم الهاتف (اختياري للزبائن العاديين)
                </label>
                <input
                  type="tel"
                  placeholder="01xxxxxxxxx"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  dir="ltr"
                  style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.88rem', boxSizing: 'border-box', textAlign: 'right' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '0.75rem', background: '#222', color: '#aaa', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  style={{ flex: 2, padding: '0.75rem', background: 'linear-gradient(135deg, #c9a84c, #8b6914)', color: '#000', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {adding ? 'جاري الإضافة...' : 'تأكيد الإضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
