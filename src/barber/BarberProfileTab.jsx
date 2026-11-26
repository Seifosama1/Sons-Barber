import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { serviceUpload } from '../lib/storageUpload'
import { serviceInsert, serviceUpdate, serviceDeleteRow } from '../lib/serviceDb'
import { useRealtime } from '../lib/useRealtime'
import { useAuth } from '../context/AuthContext'
import { parsePostLikes } from '../client/BarberProfileViewModal'
import { useConfirm } from '../context/ConfirmContext'
import { useLang } from '../context/LanguageContext'
import { BarberProfileSkeleton } from '../components/ClientSkeletons'

export default function BarberProfileTab({ user, initialOpenAddPost, onResetInitialOpenAddPost, onOpenSettings }) {
  const { logout } = useAuth()
  const { askConfirm } = useConfirm()
  const { t } = useLang()
  const [profile, setProfile] = useState(user || {})
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showEditBioModal, setShowEditBioModal] = useState(false)
  const [showAddPostModal, setShowAddPostModal] = useState(false)
  const [previewMedia, setPreviewMedia] = useState(null) // { url, type, caption }
  const [zoomScale, setZoomScale] = useState(1)

  // Edit Bio state
  const [bioInput, setBioInput] = useState('')
  const [igInput, setIgInput] = useState('')
  const [tiktokInput, setTiktokInput] = useState('')
  const [waInput, setWaInput] = useState('')
  const [savingBio, setSavingBio] = useState(false)

  // Add post state
  const [postCaption, setPostCaption] = useState('')
  const [postFile, setPostFile] = useState(null)
  const [postType, setPostType] = useState('image') // 'image' | 'video'
  const [postPreview, setPostPreview] = useState(null)
  const [uploadingPost, setUploadingPost] = useState(false)

  // Avatar upload ref
  const avatarFileRef = useRef(null)
  const postFileRef = useRef(null)

  useEffect(() => {
    if (initialOpenAddPost) {
      setShowAddPostModal(true)
      if (onResetInitialOpenAddPost) onResetInitialOpenAddPost()
    }
  }, [initialOpenAddPost])

  useEffect(() => {
    if (user?.id) {
      fetchBarberProfile()
      fetchPosts()
    }
  }, [user?.id])

  useRealtime('portfolio_photos', {}, () => {
    fetchPosts()
  })

  async function fetchBarberProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, bio, avatar_url, instagram_url, tiktok_url, whatsapp_phone, rating_avg, rating_count')
      .eq('id', user.id)
      .single()
    if (data) {
      setProfile(data)
      setBioInput(data.bio || '')
      setIgInput(data.instagram_url || '')
      setTiktokInput(data.tiktok_url || '')
      setWaInput(data.whatsapp_phone || '')
    }
  }

  async function fetchPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('portfolio_photos')
      .select('*')
      .eq('barber_id', user.id)
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

    setPosts(parsedPosts)
    setLoading(false)
  }

  /* Avatar upload / edit */
  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}-${Date.now()}.${ext}`

    // Use raw fetch with service key — guaranteed to bypass RLS
    const { publicUrl, error: upErr } = await serviceUpload('barber-media', path, file)

    if (upErr) {
      alert('فشل رفع الصورة: ' + upErr)
      return
    }

    await serviceUpdate('profiles', { avatar_url: publicUrl }, 'id', user.id)
    setProfile(prev => ({ ...prev, avatar_url: publicUrl }))
    setShowAvatarModal(false)
  }

  async function handleDeleteAvatar() {
    await serviceUpdate('profiles', { avatar_url: null }, 'id', user.id)
    setProfile(prev => ({ ...prev, avatar_url: null }))
    setShowAvatarModal(false)
  }

  /* Save Bio & Social Links */
  async function handleSaveBio(e) {
    e.preventDefault()
    setSavingBio(true)

    const updates = {
      bio: bioInput.trim() || null,
      instagram_url: igInput.trim() || null,
      tiktok_url: tiktokInput.trim() || null,
      whatsapp_phone: waInput.trim() || null,
    }

    await serviceUpdate('profiles', updates, 'id', user.id)
    setProfile(prev => ({ ...prev, ...updates }))
    setSavingBio(false)
    setShowEditBioModal(false)
  }

  /* Add new post */
  function handleSelectPostFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPostFile(file)
    const isVideo = file.type.startsWith('video')
    setPostType(isVideo ? 'video' : 'image')
    setPostPreview(URL.createObjectURL(file))
  }

  async function handleUploadPost(e) {
    e.preventDefault()
    if (!postFile) return
    setUploadingPost(true)

    const ext = postFile.name.split('.').pop()
    const path = `portfolio/${user.id}-${Date.now()}.${ext}`

    // Raw fetch upload with service key — bypasses Storage RLS
    const { publicUrl, error: upErr } = await serviceUpload('barber-media', path, postFile)

    if (upErr) {
      alert('فشل رفع المنشور: ' + upErr)
      setUploadingPost(false)
      return
    }

    // Raw fetch DB insert with service key — bypasses table RLS
    const { error: insErr } = await serviceInsert('portfolio_photos', {
      barber_id: user.id,
      photo_url: publicUrl,
      caption: postCaption.trim() || null,
      media_type: postType,
      likes_count: 0,
    })

    if (insErr) {
      alert('فشل حفظ المنشور: ' + insErr.message)
      setUploadingPost(false)
      return
    }

    setUploadingPost(false)
    setPostFile(null)
    setPostPreview(null)
    setPostCaption('')
    setShowAddPostModal(false)
    fetchPosts()
  }

  async function handleDeletePost(postId) {
    const ok = await askConfirm({
      title: t('barberDeletePostTitle'),
      message: t('barberDeletePostConfirm'),
      confirmText: t('barberConfirmDeleteYes'),
      cancelText: t('barberCancelBtn'),
      type: 'danger',
    })
    if (!ok) return
    await serviceDeleteRow('portfolio_photos', 'id', postId)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  function formatPostDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const m = (t('months') || (document.documentElement.lang === 'en' ? monthsEn : monthsAr))[d.getMonth()]
    return `${d.getDate()} ${m}`
  }

  if (loading) return <BarberProfileSkeleton />

  return (
    <div className="bp-container">
      {onOpenSettings && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.4rem 0.5rem 0' }}>
          <button
            onClick={onOpenSettings}
            className="cs-back-btn"
            style={{ width: 36, height: 36 }}
            title={t('settingsTitle')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      {/* Profile Header */}
      <div className="bp-profile-header">
        <div className="bp-avatar-wrap">
          <div className="bp-avatar-main" onClick={() => setShowAvatarModal(true)}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} />
            ) : (
              <span>{profile.name ? profile.name[0] : 'H'}</span>
            )}
          </div>
          <button
            className="bp-avatar-add-btn"
            onClick={() => avatarFileRef.current?.click()}
            title={t('barberChangeAvatar')}
          >
            +
          </button>
          <input
            type="file"
            ref={avatarFileRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleAvatarChange}
          />
        </div>

        <h2 className="bp-name">{profile.name}</h2>
        <div className="bp-phone" dir="ltr">{profile.phone}</div>
        <div className="bp-rating-line">
          <span>({profile.rating_count || 1})</span>
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {[...Array(Math.round(profile.rating_avg || 5))].map((_, i) => (
              <svg key={i} viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="#c9a84c" stroke="#c9a84c" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            ))}
          </span>
          <span>{(profile.rating_avg || 5.0).toFixed(1)}</span>
        </div>
      </div>

      {/* Bio & Social Links Card */}
      <div className="bp-bio-card">
        <div className="bp-bio-top">
          <span className="bp-bio-title">{t('barberBioAboutMe')}</span>
          <button className="bp-bio-edit-btn" onClick={() => setShowEditBioModal(true)}>
            {t('barberEditBio')}
          </button>
        </div>
        <p className="bp-bio-text">
          {profile.bio || t('barberDefaultBio')}
        </p>

        <div className="bp-social-pills">
          {profile.whatsapp_phone && (
            <a href={`https://wa.me/${profile.whatsapp_phone}`} target="_blank" rel="noreferrer" className="bp-social-pill">
              WhatsApp
            </a>
          )}
          {profile.tiktok_url && (
            <a href={profile.tiktok_url} target="_blank" rel="noreferrer" className="bp-social-pill">
              TikTok
            </a>
          )}
          {profile.instagram_url && (
            <a href={profile.instagram_url} target="_blank" rel="noreferrer" className="bp-social-pill">
              Instagram
            </a>
          )}
          {!profile.whatsapp_phone && !profile.tiktok_url && !profile.instagram_url && (
            <>
              <span className="bp-social-pill">WhatsApp</span>
              <span className="bp-social-pill">TikTok</span>
              <span className="bp-social-pill">Instagram</span>
            </>
          )}
        </div>
      </div>

      {/* Portfolio Section */}
      <div className="bp-portfolio-section">
        <div className="bp-portfolio-header">
          <span className="bp-portfolio-title">{t('barberPosts')}</span>
          <button className="bp-add-post-btn" onClick={() => setShowAddPostModal(true)}>
            {t('barberAddPost')}
          </button>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: '2rem 0' }}>
            <div className="app-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 0', color: '#666', textAlign: 'center' }}>
            <p>{t('barberNoPosts')}</p>
          </div>
        ) : (
          <div className="bp-posts-grid">
            {posts.map(post => {
              const isVideo = post.media_type === 'video' || post.photo_url?.match(/\.(mp4|webm|mov)$/i)
              return (
                <div key={post.id} className="bp-post-card">
                  <div
                    className="bp-post-media-wrap"
                    onClick={() => {
                      setZoomScale(1)
                      setPreviewMedia({ id: post.id, url: post.photo_url, type: isVideo ? 'video' : 'image', caption: post.caption, likes_count: post.likes_count || 0 })
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {isVideo ? (
                      <video src={post.photo_url} playsInline muted style={{ pointerEvents: 'none' }} />
                    ) : (
                      <img src={post.photo_url} alt={post.caption || 'قصة شعر'} />
                    )}
                    <button
                      className="bp-post-del-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePost(post.id)
                      }}
                      title={t('barberDeletePostTitle')}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                    <span className="bp-post-type-tag">
                      {isVideo ? t('barberVideoTag') : t('barberPhotoTag')}
                    </span>
                  </div>
                  <div className="bp-post-footer">
                    <span className="bp-post-date">{formatPostDate(post.created_at)}</span>
                    <span className="bp-post-likes">
                      <span>♥</span> {post.likes_count || 0}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sign Out Button at the very end of Profile */}
      <div className="bp-logout-section">
        <button
          className="bp-logout-btn"
          onClick={async () => {
            const ok = await askConfirm({
              title: t('barberLogoutTitle'),
              message: t('barberLogoutConfirm'),
              confirmText: t('barberLogoutTitle'),
              cancelText: t('barberCancelBtn'),
              type: 'danger',
            })
            if (ok) logout()
          }}
        >
          {t('barberLogoutBtn')}
        </button>
      </div>

      {/* Avatar Zoom / Instagram Style Modal */}
      {showAvatarModal && (
        <div className="bp-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAvatarModal(false)}>
          <button className="bp-modal-close" onClick={() => setShowAvatarModal(false)}>✕</button>
          <div className="bp-modal-avatar-large">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} />
            ) : (
              <span>{profile.name ? profile.name[0] : 'H'}</span>
            )}
          </div>
          <div className="bp-avatar-modal-actions">
            <button className="bp-modal-btn edit" onClick={() => { avatarFileRef.current?.click(); setShowAvatarModal(false); }}>
              {t('barberChangeAvatar')}
            </button>
            {profile.avatar_url && (
              <button className="bp-modal-btn delete" onClick={handleDeleteAvatar}>
                {t('barberDeleteAvatar')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Bio & Social Modal */}
      {showEditBioModal && (
        <div className="bp-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEditBioModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 420, width: '92%', background: '#121212', borderRadius: 20, padding: '1.2rem', border: '1px solid #282828' }}>
            <div className="sheet-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '1rem', textAlign: 'center' }}>
              تعديل النبذة والروابط
            </div>

            <form onSubmit={handleSaveBio} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  نبذة عنك
                </label>
                <textarea
                  rows={3}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="اكتب نبذة مهنية عن خبرتك وأسلوبك في الحلاقة..."
                  style={{ width: '100%', padding: '0.7rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  رابط إنستجرام (Instagram)
                </label>
                <input
                  type="url"
                  placeholder="https://instagram.com/..."
                  value={igInput}
                  onChange={(e) => setIgInput(e.target.value)}
                  dir="ltr"
                  style={{ width: '100%', padding: '0.7rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  رابط تيك توك (TikTok)
                </label>
                <input
                  type="url"
                  placeholder="https://tiktok.com/@..."
                  value={tiktokInput}
                  onChange={(e) => setTiktokInput(e.target.value)}
                  dir="ltr"
                  style={{ width: '100%', padding: '0.7rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  رقم الواتساب (WhatsApp)
                </label>
                <input
                  type="tel"
                  placeholder="201xxxxxxxxx"
                  value={waInput}
                  onChange={(e) => setWaInput(e.target.value)}
                  dir="ltr"
                  style={{ width: '100%', padding: '0.7rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEditBioModal(false)}
                  style={{ flex: 1, padding: '0.75rem', background: '#222', color: '#aaa', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingBio}
                  style={{ flex: 2, padding: '0.75rem', background: 'linear-gradient(135deg, #c9a84c, #8b6914)', color: '#000', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {savingBio ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Post Modal */}
      {showAddPostModal && (
        <div className="bp-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddPostModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 420, width: '92%', background: '#121212', borderRadius: 20, padding: '1.2rem', border: '1px solid #282828' }}>
            <div className="sheet-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '1rem', textAlign: 'center' }}>
              إضافة عمل جديد لمعرضك
            </div>

            <form onSubmit={handleUploadPost} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div
                onClick={() => postFileRef.current?.click()}
                style={{
                  border: '2px dashed rgba(201,168,76,0.3)',
                  borderRadius: 14,
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: '#161616',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {postPreview ? (
                  postType === 'video' ? (
                    <video src={postPreview} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }} controls />
                  ) : (
                    <img src={postPreview} alt="معاينة" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }} />
                  )
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8, color: 'var(--gold)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                      </svg>
                    </div>
                    <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.88rem' }}>اضغط لاختيار صورة أو فيديو</div>
                    <div style={{ color: '#666', fontSize: '0.72rem', marginTop: 2 }}>يدعم JPG, PNG, MP4 حتى 50MB</div>
                  </div>
                )}
                <input
                  type="file"
                  ref={postFileRef}
                  style={{ display: 'none' }}
                  accept="image/*,video/*"
                  onChange={handleSelectPostFile}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginBottom: 4 }}>
                  وصف المنشور (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: قصة كلاسيكية مع تحديد اللحية"
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddPostModal(false)}
                  style={{ flex: 1, padding: '0.75rem', background: '#222', color: '#aaa', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!postFile || uploadingPost}
                  style={{ flex: 2, padding: '0.75rem', background: 'linear-gradient(135deg, #c9a84c, #8b6914)', color: '#000', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', opacity: !postFile ? 0.5 : 1 }}
                >
                  {uploadingPost ? 'جاري النشر...' : 'نشر الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile-Proportioned Full Screen / Semi Full Screen Preview Modal */}
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
            zIndex: 1200,
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

            {/* Close button */}
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
            >
              ✕
            </button>
          </div>

          {/* Main preview container - larger and responsive */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '78vh',
              background: '#050505',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.95), 0 0 40px rgba(201, 168, 76, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #2a2a2a',
              position: 'relative'
            }}
          >
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

            {/* Footer with caption and Heart button */}
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

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#c9a84c',
                  fontSize: '0.9rem',
                  fontWeight: 700
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#c9a84c" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span>{previewMedia.likes_count || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
