import '../styles/skeleton.css'

export function SkeletonBlock({ width, height, borderRadius, style }) {
  return (
    <div
      className="sk-block"
      style={{
        width: width ?? '100%',
        height: height ?? 20,
        borderRadius: borderRadius ?? 8,
        ...style,
      }}
    />
  )
}

/* Home Tab Skeleton */
export function ClientHomeSkeleton() {
  return (
    <div className="ch-page sk-wrapper">
      {/* Greeting Skeleton */}
      <div className="sk-home-greeting">
        <SkeletonBlock width="45%" height={26} borderRadius={8} />
        <SkeletonBlock width="65%" height={16} borderRadius={6} />
      </div>

      {/* Shop Status Card Skeleton */}
      <div className="sk-shop-card">
        <SkeletonBlock width={40} height={40} borderRadius={50} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonBlock width="40%" height={16} borderRadius={6} />
          <SkeletonBlock width="70%" height={12} borderRadius={4} />
        </div>
      </div>

      {/* Quick Action Button Skeleton */}
      <SkeletonBlock height={54} borderRadius={16} />

      {/* Loyalty Card Skeleton */}
      <div className="sk-loyalty-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonBlock width="35%" height={18} borderRadius={6} />
          <SkeletonBlock width="25%" height={18} borderRadius={6} />
        </div>
        <SkeletonBlock width="100%" height={10} borderRadius={5} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonBlock width="30%" height={14} borderRadius={4} />
          <SkeletonBlock width="20%" height={14} borderRadius={4} />
        </div>
      </div>

      {/* Recent Sessions Title & Card Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '0.5rem' }}>
        <SkeletonBlock width="30%" height={18} borderRadius={6} />
        <div className="sk-session-card" />
        <div className="sk-session-card" />
      </div>
    </div>
  )
}

/* Waitlist Tab Skeleton */
export function ClientWaitlistSkeleton() {
  return (
    <div className="cw-page sk-wrapper">
      {/* Title & Subtitle */}
      <div className="sk-waitlist-header">
        <SkeletonBlock width="35%" height={24} borderRadius={8} />
        <SkeletonBlock width="75%" height={14} borderRadius={6} />
      </div>

      {/* 2 Barber Queue Cards Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {[1, 2].map((i) => (
          <div key={i} className="sk-barber-queue-card">
            <div className="sk-queue-top">
              <div className="sk-queue-barber-info">
                <SkeletonBlock width={54} height={54} borderRadius={50} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonBlock width={100} height={16} borderRadius={6} />
                  <SkeletonBlock width={60} height={12} borderRadius={4} />
                </div>
              </div>
              <SkeletonBlock width={75} height={26} borderRadius={20} />
            </div>

            <div className="sk-queue-stats-row">
              <SkeletonBlock height={44} borderRadius={12} />
              <SkeletonBlock height={44} borderRadius={12} />
            </div>

            <SkeletonBlock height={48} borderRadius={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* Barbers Tab Skeleton */
export function ClientBarbersSkeleton() {
  return (
    <div className="cb-page sk-wrapper">
      {/* Title & Subtitle */}
      <div className="sk-waitlist-header">
        <SkeletonBlock width="35%" height={24} borderRadius={8} />
        <SkeletonBlock width="65%" height={14} borderRadius={6} />
      </div>

      {/* Barber Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="sk-barber-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <SkeletonBlock width={58} height={58} borderRadius={50} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SkeletonBlock width={110} height={18} borderRadius={6} />
                <SkeletonBlock width={70} height={14} borderRadius={4} />
              </div>
            </div>
            <SkeletonBlock width={40} height={24} borderRadius={8} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* Notifications Tab Skeleton */
export function ClientNotificationsSkeleton() {
  return (
    <div className="cn-page sk-wrapper">
      <SkeletonBlock width="35%" height={24} borderRadius={8} style={{ marginBottom: '0.4rem' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="sk-notif-card">
            <SkeletonBlock width={40} height={40} borderRadius={50} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBlock width="50%" height={16} borderRadius={6} />
                <SkeletonBlock width={45} height={12} borderRadius={4} />
              </div>
              <SkeletonBlock width="85%" height={13} borderRadius={4} />
              <SkeletonBlock width="65%" height={13} borderRadius={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Profile Tab Skeleton */
export function ClientProfileSkeleton() {
  return (
    <div className="cp-page sk-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
        <SkeletonBlock width={90} height={20} borderRadius={6} />
        <SkeletonBlock width={38} height={38} borderRadius={50} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '1rem 0' }}>
        <div className="sk-profile-avatar sk-block" />
        <SkeletonBlock width={120} height={18} borderRadius={6} />
        <SkeletonBlock width={90} height={13} borderRadius={4} />
      </div>

      <div className="sk-profile-card">
        <SkeletonBlock width="40%" height={14} borderRadius={4} style={{ marginBottom: 12 }} />
        <SkeletonBlock width="100%" height={45} borderRadius={10} style={{ marginBottom: 10 }} />
        <SkeletonBlock width="60%" height={12} borderRadius={4} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SkeletonBlock height={75} borderRadius={16} />
        <SkeletonBlock height={75} borderRadius={16} />
      </div>
    </div>
  )
}

/* Barber Home Tab Skeleton */
export function BarberHomeSkeleton() {
  return (
    <div className="bh-page sk-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock width={120} height={24} borderRadius={8} />
        <SkeletonBlock width={70} height={30} borderRadius={20} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SkeletonBlock height={80} borderRadius={16} />
        <SkeletonBlock height={80} borderRadius={16} />
      </div>
      <SkeletonBlock height={120} borderRadius={16} />
      <SkeletonBlock height={100} borderRadius={16} />
    </div>
  )
}

/* Barber Queue Tab Skeleton */
export function BarberQueueSkeleton() {
  return (
    <div className="bq-page sk-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SkeletonBlock height={130} borderRadius={18} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock width={100} height={20} borderRadius={6} />
        <SkeletonBlock width={90} height={34} borderRadius={10} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <SkeletonBlock key={i} height={64} borderRadius={14} />
        ))}
      </div>
    </div>
  )
}

/* Barber Schedule Tab Skeleton */
export function BarberScheduleSkeleton() {
  return (
    <div className="bs-page sk-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'hidden' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <SkeletonBlock key={i} width={60} height={75} borderRadius={12} style={{ flexShrink: 0 }} />
        ))}
      </div>
      <SkeletonBlock height={45} borderRadius={12} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <SkeletonBlock key={i} height={70} borderRadius={14} />
        ))}
      </div>
    </div>
  )
}

/* Barber Profile Tab Skeleton */
export function BarberProfileSkeleton() {
  return (
    <div className="bp-page sk-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', alignItems: 'center' }}>
      <SkeletonBlock width={100} height={100} borderRadius={50} />
      <SkeletonBlock width={140} height={22} borderRadius={8} />
      <SkeletonBlock width={180} height={14} borderRadius={6} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <SkeletonBlock key={i} height={110} borderRadius={10} />
        ))}
      </div>
    </div>
  )
}
