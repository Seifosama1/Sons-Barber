import '../styles/splash.css'

export default function LoadingScreen({ title = 'Sons Barber', subtitle = 'Look Sharp. Feel Sharp.' }) {
  return (
    <div className="brand-splash-screen">
      <div className="brand-splash-content">
        {/* Golden Glowing App Icon */}
        <div className="brand-splash-icon-wrap">
          <div className="brand-splash-icon-glow" />
          <img
            src="/app-icon-gold.png"
            alt="Sons Barber Icon"
            className="brand-splash-icon-img"
          />
        </div>

        {/* Title */}
        <h1 className="brand-splash-title">{title}</h1>

        {/* Tagline */}
        <p className="brand-splash-tagline">{subtitle}</p>

        {/* Golden Loading Progress Bar (Matching design) */}
        <div className="brand-splash-progress-track">
          <div className="brand-splash-progress-bar" />
        </div>
      </div>
    </div>
  )
}
