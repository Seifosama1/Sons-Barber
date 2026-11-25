import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { registerBarberPush } from '../lib/usePushNotifications'
import BarberHomeTab from '../barber/BarberHomeTab'
import BarberScheduleTab from '../barber/BarberScheduleTab'
import BarberQueueTab from '../barber/BarberQueueTab'
import BarberProfileTab from '../barber/BarberProfileTab'
import '../styles/barber.css'

export default function BarberPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('home') // 'home' | 'schedule' | 'queue' | 'profile'
  const [waitingCount, setWaitingCount] = useState(0)
  const [hasNewAppt, setHasNewAppt] = useState(false)
  const [actionParams, setActionParams] = useState({})

  useEffect(() => {
    if (!user?.id) return
    fetchWaitingCount()
    checkNewAppointments()
    // Register push notifications for barber (ask permission once)
    registerBarberPush(user.id)

    // Listen for messages from service worker (notification tap -> open queue tab)
    function handleSwMessage(event) {
      if (event.data?.type === 'OPEN_TAB' && event.data?.tab) {
        setTab(event.data.tab)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage)
  }, [user?.id])

  // Realtime updates on waitlist for barber
  useRealtime('waitlist', {}, () => {
    fetchWaitingCount()
  })

  // Realtime updates on appointments for red dot alert
  useRealtime('appointments', {}, (payload) => {
    if (payload.new?.barber_id === user?.id) {
      setHasNewAppt(true)
    }
  })

  async function checkNewAppointments() {
    const today = new Date().toISOString().slice(0, 10)
    const lastSeen = localStorage.getItem(`barber_last_seen_appts_${user?.id}`) || '1970-01-01'
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', user.id)
      .in('status', ['confirmed', 'pending'])
      .gt('created_at', lastSeen)
    if (count && count > 0) {
      setHasNewAppt(true)
    }
  }

  async function fetchWaitingCount() {
    const { count } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', user.id)
      .eq('status', 'waiting')
    setWaitingCount(count || 0)
  }

  function handleNavigate(targetTab, params = {}) {
    setTab(targetTab)
    if (params) setActionParams(params)
  }

  const initial = user?.name ? user.name.trim()[0].toUpperCase() : 'B'

  return (
    <div className="barber-shell">
      {/* Top Bar */}
      <header className="barber-topbar">
        <div className="barber-brand">
          <div className="barber-brand-icon">
            <ScissorsIcon />
          </div>
          <span className="barber-brand-text">Sons Barber</span>
        </div>
        <div
          className="barber-topbar-avatar"
          onClick={() => setTab('profile')}
          title="الملف الشخصي"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      </header>

      {/* Main Page Content */}
      <main className="barber-content">
        {tab === 'home' && (
          <BarberHomeTab
            user={user}
            onNavigateTab={handleNavigate}
          />
        )}
        {tab === 'schedule' && (
          <BarberScheduleTab
            user={user}
          />
        )}
        {tab === 'queue' && (
          <BarberQueueTab
            user={user}
            initialOpenAdd={actionParams.openAdd}
            onResetInitialOpenAdd={() => setActionParams(prev => ({ ...prev, openAdd: false }))}
          />
        )}
        {tab === 'profile' && (
          <BarberProfileTab
            user={user}
            initialOpenAddPost={actionParams.openAddPost}
            onResetInitialOpenAddPost={() => setActionParams(prev => ({ ...prev, openAddPost: false }))}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="barber-nav">
        <div className="nav-items">
          <button
            className={`nav-item ${tab === 'home' ? 'active' : ''}`}
            onClick={() => setTab('home')}
          >
            <HomeIcon />
            <span>الرئيسية</span>
          </button>

          <button
            className={`nav-item ${tab === 'queue' ? 'active' : ''}`}
            onClick={() => setTab('queue')}
          >
            <QueueIcon />
            <span>طابوري</span>
            {waitingCount > 0 && <span className="barber-nav-dot" />}
          </button>

          <button
            className={`nav-item ${tab === 'schedule' ? 'active' : ''}`}
            onClick={() => {
              setTab('schedule')
              setHasNewAppt(false)
              localStorage.setItem(`barber_last_seen_appts_${user?.id}`, new Date().toISOString())
            }}
          >
            <CalendarIcon />
            <span>جدولي</span>
            {hasNewAppt && <span className="barber-nav-dot" style={{ background: '#ef4444' }} />}
          </button>

          <button
            className={`nav-item ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')}
          >
            <PersonIcon />
            <span>ملفي</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

/* ── Icons ── */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}
