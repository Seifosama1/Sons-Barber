import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useConfirm } from '../context/ConfirmContext'
import DashTab from '../admin/DashTab'
import CrewTab from '../admin/CrewTab'
import ClientsTab from '../admin/ClientsTab'
import StatsTab from '../admin/StatsTab'
import '../styles/admin.css'

const TABS = [
  { id: 'dash',    label: 'الرئيسية', icon: HomeIcon },
  { id: 'stats',   label: 'الإحصائيات', icon: ChartIcon },
  { id: 'crew',    label: 'الفريق',   icon: ScissorsIcon },
  { id: 'clients', label: 'العملاء',  icon: UsersIcon },
]

export default function AdminPage() {
  const { user, logout } = useAuth()
  const { askConfirm } = useConfirm()
  const [tab, setTab] = useState('dash')
  const [waitingCount, setWaitingCount] = useState(0)
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0)

  const initial = user?.name ? user.name.trim()[0].toUpperCase() : 'A'

  useEffect(() => {
    fetchWaitingCount()
    fetchPendingBookings()
  }, [])

  async function fetchWaitingCount() {
    const { count } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting')
    setWaitingCount(count || 0)
  }

  async function fetchPendingBookings() {
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingBookingsCount(count || 0)
  }

  useRealtime('waitlist', {}, () => {
    fetchWaitingCount()
  })

  useRealtime('appointments', {}, () => {
    fetchPendingBookings()
  })

  return (
    <div className="admin-shell">
      {/* Top bar */}
      <header className="admin-topbar">
        <div className="topbar-brand">
          <div className="topbar-logo"><ScissorsIcon /></div>
          <span className="topbar-name">Sons Barber</span>
        </div>
        <div
          className="topbar-avatar"
          onClick={async () => {
            const ok = await askConfirm({
              title: 'تسجيل الخروج',
              message: 'هل أنت متأكد من رغبتك في تسجيل الخروج من لوحة التحكم؟',
              confirmText: 'نعم، تسجيل الخروج',
              cancelText: 'إلغاء',
              type: 'danger',
            })
            if (ok) logout()
          }}
          title="تسجيل الخروج"
        >
          {initial}
        </div>
      </header>

      {/* Page content */}
      <main className="admin-content">
        {tab === 'dash'    && <DashTab user={user} onNavigateTab={setTab} />}
        {tab === 'stats'   && <StatsTab />}
        {tab === 'crew'    && <CrewTab />}
        {tab === 'clients' && <ClientsTab />}
      </main>

      {/* Bottom nav */}
      <nav className="admin-nav">
        <div className="nav-items">
          {TABS.map(t => {
            const Icon = t.icon
            const isCrew = t.id === 'crew'
            const isDash = t.id === 'dash'
            return (
              <button
                key={t.id}
                className={`nav-item ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="admin-nav-icon-wrap">
                  <Icon />
                  {isDash && pendingBookingsCount > 0 && (
                    <span className="admin-dash-dot" title={`${pendingBookingsCount} طلبات حجز معلقة`} />
                  )}
                  {isCrew && waitingCount > 0 && (
                    <span className="admin-crew-dot" title={`${waitingCount} في قائمة الانتظار`} />
                  )}
                </span>
                <span>{t.label}</span>
                {tab === t.id && <span className="nav-active-dot" />}
              </button>
            )
          })}
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
function ChartIcon({ style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
