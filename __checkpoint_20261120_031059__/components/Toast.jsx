import { useEffect, useState } from 'react'
import '../styles/toast.css'

export default function Toast({ msg, type = 'success', onDone, duration = 3000, gold = false }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, duration)
    return () => clearTimeout(t)
  }, [])

  const cls = gold ? 'toast-gold' : `toast-${type}`

  return (
    <div className={`toast ${cls} ${visible ? 'show' : ''}`}>
      <span className="toast-icon">{gold ? '✂️' : type === 'success' ? '✓' : '!'}</span>
      {msg}
    </div>
  )
}
