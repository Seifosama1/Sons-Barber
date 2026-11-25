import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import ClientHome from '../client/ClientHome'
import ClientWaitlist from '../client/ClientWaitlist'
import ClientBarbers from '../client/ClientBarbers'
import ClientProfile from '../client/ClientProfile'
import ClientNotifications from '../client/ClientNotifications'
import '../styles/client.css'

export default function ClientPage() {
  const { user } = useAuth()
  const { t } = useLang()
  const [tab, setTab]       = useState('home')
  const [unread, setUnread] = useState(0)

  // Bootstrap unread count on mount
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_id', user.id)
      .eq('is_read', false)
      .then(({ count }) => setUnread(count || 0))
  }, [user?.id])

  // Live — increment dot whenever a new notification arrives, from any tab
  useRealtime('notifications', {}, (payload) => {
    if (
      payload.eventType === 'INSERT' &&
      payload.new?.target_user_id === user?.id &&
      !payload.new?.is_read
    ) {
      setUnread(u => u + 1)
    }
  })

  return (
    <div className="client-shell">
      <main className="client-content">
        {tab === 'home'          && <ClientHome          user={user} />}
        {tab === 'waitlist'      && <ClientWaitlist      user={user} />}
        {tab === 'barbers'       && <ClientBarbers       user={user} />}
        {tab === 'notifications' && <ClientNotifications user={user} onUnreadChange={setUnread} />}
        {tab === 'profile'       && <ClientProfile       user={user} />}
      </main>

      <nav className="client-nav">
        <div className="nav-items">

          <button className={`nav-item ${tab === 'waitlist' ? 'active' : ''}`} onClick={() => setTab('waitlist')}>
            <QueueIcon />
            <span>{t('navWaitlist')}</span>
            {tab === 'waitlist' && <span className="nav-active-dot" />}
          </button>

          <button className={`nav-item ${tab === 'barbers' ? 'active' : ''}`} onClick={() => setTab('barbers')}>
            <ScissorsIcon />
            <span>{t('navBarbers')}</span>
            {tab === 'barbers' && <span className="nav-active-dot" />}
          </button>

          <button className={`nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            <HomeIcon />
            <span>{t('navHome')}</span>
            {tab === 'home' && <span className="nav-active-dot" />}
          </button>

          <button className={`nav-item ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>
            <span className="nav-bell-wrap">
              <BellIcon />
              {unread > 0 && <span className="nav-bell-dot" />}
            </span>
            <span>{t('navNotifs')}</span>
            {tab === 'notifications' && <span className="nav-active-dot" />}
          </button>

          <button className={`nav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
            <PersonIcon />
            <span>{t('navProfile')}</span>
            {tab === 'profile' && <span className="nav-active-dot" />}
          </button>

        </div>
      </nav>
    </div>
  )
}

function HomeIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg> }
function QueueIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> }
function ScissorsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
function BellIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function PersonIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
