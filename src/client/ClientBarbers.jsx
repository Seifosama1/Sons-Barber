import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { useLang } from '../context/LanguageContext'
import BarberProfileViewModal from './BarberProfileViewModal'
import { ClientBarbersSkeleton } from '../components/ClientSkeletons'

export default function ClientBarbers({ user }) {
  const { t } = useLang()
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBarber, setSelectedBarber] = useState(null)

  useEffect(() => { fetchBarbers() }, [])

  // No filter — row-level realtime filters require replica identity
  // Refetch on any profile change (rating trigger updates profiles.rating_avg)
  useRealtime('profiles', {}, (payload) => {
    if (payload.new?.role === 'barber' || payload.new?.rating_avg !== undefined) {
      fetchBarbers()
    }
  })

  // Also listen directly on barber_ratings for instant update
  useRealtime('barber_ratings', {}, () => fetchBarbers())

  async function fetchBarbers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, is_active, rating_avg, rating_count, avatar_url, bio, instagram_url, tiktok_url, whatsapp_phone')
      .eq('role', 'barber')
      .order('created_at')
    setBarbers(data || [])
    setLoading(false)
  }

  if (loading) return <ClientBarbersSkeleton />

  return (
    <div className="cb-page">
      <div className="cb-header">
        <h2 className="cb-title">{t('barbersTitle')}</h2>
        <p className="cb-sub">{t('barbersSub')}</p>
      </div>

      {barbers.length === 0 ? (
        <div className="empty-state">
          <ScissorsIconLg />
          <p>{t('noBarbersYet')}</p>
        </div>
      ) : (
        barbers.map(b => (
          <BarberCard key={b.id} barber={b} t={t} onClick={() => setSelectedBarber(b)} />
        ))
      )}

      {selectedBarber && (
        <BarberProfileViewModal
          barber={selectedBarber}
          onClose={() => setSelectedBarber(null)}
          currentUserId={user?.id}
        />
      )}
    </div>
  )
}

function BarberCard({ barber, t, onClick }) {
  return (
    <div
      className={`cb-barber-card ${!barber.is_active ? 'inactive' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="cb-barber-left">
        <div className="cb-avatar" style={{ overflow: 'hidden' }}>
          {barber.avatar_url ? (
            <img src={barber.avatar_url} alt={barber.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            barber.name[0]
          )}
          <span className={`cb-status-dot ${barber.is_active ? 'active' : 'offline'}`} />
        </div>
        <div className="cb-barber-info">
          <span className="cb-barber-name">{barber.name}</span>
          <div className="cb-rating-row">
            <StarRow avg={barber.rating_avg || 0} />
            <span className="cb-rating-val">{(barber.rating_avg || 0).toFixed(1)}</span>
            <span className="cb-rating-count">({barber.rating_count || 0})</span>
          </div>
          <span className={`cb-status-label ${barber.is_active ? 'active' : 'offline'}`}>
            {barber.is_active ? t('statusActive') : t('statusOffline')}
          </span>
        </div>
      </div>
      <div className="cb-arrow">←</div>
    </div>
  )
}

function StarRow({ avg }) {
  return (
    <div style={{ display:'flex', gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} viewBox="0 0 24 24" style={{width:12,height:12}}
          fill={avg >= i ? '#c9a84c' : avg >= i-0.5 ? 'url(#half)' : 'none'}
          stroke="#c9a84c" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  )
}

function ScissorsIconLg() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:48,height:48,opacity:0.2}}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
