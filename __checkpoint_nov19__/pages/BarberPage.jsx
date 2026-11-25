import { useAuth } from '../context/AuthContext'

export default function BarberPage() {
  const { user, logout } = useAuth()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, sans-serif', flexDirection: 'column', gap: '1rem', direction: 'rtl' }}>
      <div style={{ fontSize: '3rem' }}>✂️</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>أهلاً، {user?.name}</h1>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>صفحة الحلاق — قريباً</p>
      <button onClick={logout} style={{ marginTop: '1rem', padding: '0.65rem 2rem', background: '#c9a84c', color: '#000', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
        تسجيل الخروج
      </button>
    </div>
  )
}
