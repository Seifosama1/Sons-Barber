import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { serviceUpdate } from '../lib/serviceDb'

// Helper to parse likes and clean display caption
export function parsePostLikes(rawCaption) {
  if (!rawCaption) return { uids: [], displayCaption: '' }
  const match = rawCaption.match(/<!--LIKES:(\[.*?\])-->/)
  let uids = []
  let displayCaption = rawCaption
  if (match) {
    try {
      uids = JSON.parse(match[1])
      if (!Array.isArray(uids)) uids = []
    } catch {
      uids = []
    }
    displayCaption = rawCaption.replace(/<!--LIKES:\[.*?\]-->/, '').trim()
  }
  return { uids, displayCaption }
}

export function formatPostWithLikes(displayCaption, uids) {
  const clean = (displayCaption || '').trim()
  return `${clean}<!--LIKES:${JSON.stringify(uids)}-->`
}

export default function BarberProfileViewModal({ barber, onClose, currentUserId }) {
  const [profile, setProfile] = useState(barber || {})
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [likedPosts, setLikedPosts] = useState({})
  const [animatingHeart, setAnimatingHeart] = useState(null)
  const [previewMedia, setPreviewMedia] = useState(null) // { id, url, type, caption, likes_count, post }
  const [zoomScale, setZoomScale] = useState(1)
  const [showAvatarZoom, setShowAvatarZoom] = useState(false)

  useEffect(() => {
    if (barber?.id) {
      fetchBarberDetails()
      fetchBarberPosts()
    }
  }, [barber?.id, currentUserId])

  async function fetchBarberDetails() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, bio, avatar_url, instagram_url, tiktok_url, whatsapp_phone, rating_avg, rating_count')
      .eq('id', barber.id)
      .single()
    if (data) setProfile(data)
  }

  async function fetchBarberPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('portfolio_photos')
      .select('*')
      .eq('barber_id', barber.id)
      .order('created_at', { ascending: false })

    const parsedPosts = (data || []).map(post => {
      const { uids, displayCaption } = parsePostLikes(post.caption)
      const count = uids.length > 0 ? uids.length : (post.likes_count || 0)
      return {
        ...post,
        caption: displayCaption,
        rawCaption: post.caption,
        liked_uids: uids,
        likes_count: count,
      }
    })

    const initialLikes = {}
    parsedPosts.forEach(post => {
      if (currentUserId && post.liked_uids.includes(currentUserId)) {
        initialLikes[post.id] = true
      }
    })

    setLikedPosts(initialLikes)
    setPosts(parsedPosts)
    setLoading(false)
  }

  async function toggleLike(post) {
    if (!currentUserId) {
      alert('يرجى تسجيل الدخول لتسجيل الإعجاب')
      return
    }

    const { uids: currentUids, displayCaption } = parsePostLikes(post.rawCaption || post.caption)
    const isAlreadyLiked = currentUids.includes(currentUserId)
    
    let updatedUids
    if (isAlreadyLiked) {
      updatedUids = currentUids.filter(id => id !== currentUserId)
    } else {
      updatedUids = [...new Set([...currentUids, currentUserId])]
    }

    const newLikedState = !isAlreadyLiked
    const newCount = updatedUids.length
    const newDbCaption = formatPostWithLikes(displayCaption, updatedUids)

    // Optimistic UI updates
    setLikedPosts(prev => ({ ...prev, [post.id]: newLikedState }))

    setPosts(prev =>
      prev.map(p =>
        p.id === post.id
          ? {
              ...p,
              caption: displayCaption,
              rawCaption: newDbCaption,
              liked_uids: updatedUids,
              likes_count: newCount,
            }
          : p
      )
    )

    if (previewMedia && previewMedia.id === post.id) {
      setPreviewMedia(prev => ({
        ...prev,
        caption: displayCaption,
        likes_count: newCount,
        post: {
          ...prev.post,
          caption: displayCaption,
          rawCaption: newDbCaption,
          liked_uids: updatedUids,
          likes_count: newCount,
        }
      }))
    }

    if (newLikedState) {
      setAnimatingHeart(post.id)
      setTimeout(() => setAnimatingHeart(null), 600)
    }

    // Persist to Supabase Database
    try {
      await serviceUpdate(
        'portfolio_photos',
        {
          caption: newDbCaption,
          likes_count: newCount,
        },
        'id',
        post.id
      )
    } catch (err) {
      console.error('Failed to update like in database:', err)
    }
  }

  function formatPostDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    return `${d.getDate()} ${months[d.getMonth()]}`
  }

  // Format clean whatsapp number with country code (removes spaces, +, dashes)
  function getWhatsAppUrl(num) {
    if (!num) return ''
    let cleaned = String(num).replace(/[^0-9]/g, '')
    if (cleaned.startsWith('01')) {
      cleaned = '2' + cleaned // Egypt +20
    } else if (cleaned.startsWith('1') && cleaned.length === 10) {
      cleaned = '20' + cleaned
    }
    return `https://wa.me/${cleaned}`
  }

  return (
    <div
      className="ig-profile-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 1000,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Instagram Header bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(16px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="رجوع"
        >
          {/* Back arrow icon */}
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', direction: 'ltr' }}>
          {profile.name || 'Barber Profile'}
        </div>

        <div style={{ width: 26 }} /> {/* Balance spacer */}
      </header>

      {/* Profile Body */}
      <div style={{ padding: '1rem', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Instagram Profile Top Row: Avatar + Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '0.85rem' }}>
          <div
            onClick={() => setShowAvatarZoom(true)}
            style={{
              width: 82,
              height: 82,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #c9a84c, #8b6914)',
              padding: 2.5,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: '#000',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c9a84c',
                fontSize: '2rem',
                fontWeight: 800,
              }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                profile.name?.[0]?.toUpperCase() || 'H'
              )}
            </div>
          </div>

          {/* Stats columns */}
          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{posts.length}</div>
              <div style={{ fontSize: '0.72rem', color: '#888' }}>منشورات</div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#c9a84c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <span>{(profile.rating_avg || 5.0).toFixed(1)}</span>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }} fill="#c9a84c" stroke="#c9a84c" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#888' }}>التقييم</div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>
                {profile.rating_count || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#888' }}>مراجعة</div>
            </div>
          </div>
        </div>

        {/* Bio Info */}
        <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff' }}>{profile.name}</div>
          {profile.phone && (
            <div style={{ fontSize: '0.8rem', color: '#888', direction: 'ltr', textAlign: 'right', marginTop: 2 }}>
              {profile.phone}
            </div>
          )}
          {profile.bio && (
            <div style={{ fontSize: '0.84rem', color: '#bbb', lineHeight: 1.5, marginTop: 6, whiteSpace: 'pre-line' }}>
              {profile.bio}
            </div>
          )}
        </div>

        {/* Social Link Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
          {profile.whatsapp_phone && (
            <a
              href={getWhatsAppUrl(profile.whatsapp_phone)}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                minWidth: 100,
                padding: '0.55rem',
                borderRadius: 10,
                background: '#25D366',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.82rem',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <span>واتساب WhatsApp</span>
            </a>
          )}

          {profile.instagram_url && (
            <a
              href={profile.instagram_url}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                minWidth: 100,
                padding: '0.55rem',
                borderRadius: 10,
                background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.82rem',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              Instagram
            </a>
          )}

          {profile.tiktok_url && (
            <a
              href={profile.tiktok_url}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                minWidth: 100,
                padding: '0.55rem',
                borderRadius: 10,
                background: '#1a1a1a',
                border: '1px solid #333',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.82rem',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              TikTok
            </a>
          )}
        </div>

        {/* Instagram Grid Tabs */}
        <div
          style={{
            borderTop: '1px solid #1f1f1f',
            borderBottom: '1px solid #1f1f1f',
            padding: '0.65rem 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            color: '#c9a84c',
            fontWeight: 800,
            fontSize: '0.85rem',
            marginBottom: '0.8rem',
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>المعرض ({posts.length})</span>
        </div>

        {/* 3-Column Instagram Style Posts Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="app-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '2.5rem 0' }}>
            لا توجد منشورات حتى الآن
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 3,
            }}
          >
            {posts.map(post => {
              const isVideo = post.media_type === 'video' || post.photo_url?.match(/\.(mp4|webm|mov)$/i)
              const isLiked = !!likedPosts[post.id]

              return (
                <div
                  key={post.id}
                  onClick={() => {
                    setZoomScale(1)
                    setPreviewMedia({
                      id: post.id,
                      url: post.photo_url,
                      type: isVideo ? 'video' : 'image',
                      caption: post.caption,
                      likes_count: post.likes_count || 0,
                      post,
                    })
                  }}
                  style={{
                    position: 'relative',
                    aspectRatio: '1/1',
                    background: '#111',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  {isVideo ? (
                    <video
                      src={post.photo_url}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={post.photo_url}
                      alt={post.caption || 'قصة'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  {/* Video icon */}
                  {isVideo && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 5,
                        left: 5,
                        color: '#fff',
                        fontSize: '0.7rem',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                    >
                      ▶
                    </span>
                  )}

                  {/* Likes badge */}
                  {post.likes_count > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        color: isLiked ? '#c9a84c' : '#fff',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: 'rgba(0,0,0,0.6)',
                        padding: '1px 5px',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      ♥ {post.likes_count}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Avatar Zoom Modal */}
      {showAvatarZoom && (
        <div
          onClick={() => setShowAvatarZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(12px)',
            zIndex: 1400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <button
            onClick={() => setShowAvatarZoom(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: '#222',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 38,
              height: 38,
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 220,
              height: 220,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #c9a84c',
              boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
            }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#c9a84c', fontSize: '4rem', fontWeight: 800 }}>
                {profile.name?.[0]?.toUpperCase() || 'H'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Screen Media Preview Modal with Pinch/Click Zoom & Heart */}
      {previewMedia && (
        <div
          className="bp-fullscreen-modal"
          onClick={() => {
            setZoomScale(1)
            setPreviewMedia(null)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(15px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
            padding: '1rem',
          }}
        >
          {/* Top Actions: Close + Zoom toggle */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 15,
            }}
          >
            {/* Zoom In/Out Button (Images only) */}
            {previewMedia.type === 'image' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setZoomScale(prev => (prev === 1 ? 2 : 1))
                }}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                <span>{zoomScale > 1 ? 'تصغير' : 'تكبير Zoom'}</span>
              </button>
            )}

            {/* Exit button */}
            <button
              onClick={() => {
                setZoomScale(1)
                setPreviewMedia(null)
              }}
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                marginRight: 'auto',
              }}
              title="إغلاق الشاشة الكاملة"
            >
              ✕
            </button>
          </div>

          {/* Media Card Container */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '80vh',
              background: '#050505',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.95), 0 0 40px rgba(201, 168, 76, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #2a2a2a',
              position: 'relative',
            }}
          >
            {/* Media Area */}
            <div
              style={{
                width: '100%',
                maxHeight: '68vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000',
                overflow: 'hidden',
                cursor: previewMedia.type === 'image' ? 'zoom-in' : 'default',
              }}
              onClick={() => {
                if (previewMedia.type === 'image') {
                  setZoomScale(prev => (prev === 1 ? 2 : 1))
                }
              }}
            >
              {previewMedia.type === 'video' ? (
                <video
                  src={previewMedia.url}
                  controls
                  autoPlay
                  playsInline
                  style={{ width: '100%', maxHeight: '68vh', objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={previewMedia.url}
                  alt="Preview"
                  style={{
                    width: '100%',
                    maxHeight: '68vh',
                    objectFit: 'contain',
                    transform: `scale(${zoomScale})`,
                    transition: 'transform 0.3s ease',
                  }}
                />
              )}
            </div>

            {/* Footer with Caption & Like Heart */}
            <div
              style={{
                padding: '0.85rem 1rem',
                background: '#111',
                borderTop: '1px solid #222',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ color: '#eee', fontSize: '0.88rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {previewMedia.caption || 'قصة شعر مميزة'}
              </div>

              {previewMedia.post && (
                <button
                  className={`bp-like-btn ${likedPosts[previewMedia.id] ? 'liked' : ''} ${animatingHeart === previewMedia.id ? 'animating' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleLike(previewMedia.post)
                  }}
                  title={likedPosts[previewMedia.id] ? 'إلغاء الإعجاب' : 'إعجاب'}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill={likedPosts[previewMedia.id] ? '#c9a84c' : 'none'}
                    stroke={likedPosts[previewMedia.id] ? '#c9a84c' : '#888'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: likedPosts[previewMedia.id] ? '#c9a84c' : '#aaa' }}>
                    {previewMedia.likes_count || 0}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
