import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Admin is identified by phone number — not a separate Supabase role in auth
const ADMIN_PHONE = '01288894721'

// We store phone as a fake email so Supabase email auth works
function phoneToEmail(phone) {
  return `${phone.replace(/\s/g, '')}@sonsbarber.app`
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // { id, name, phone, role, birthday }
  const [loading, setLoading] = useState(true) // true while session is being restored
  const [error, setError] = useState('')

  // Restore session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch(() => {
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // If user is already loaded and matches current session, avoid blank flickers
        if (user?.id !== session.user.id) {
          await fetchProfile(session.user.id)
        }
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Live profile updates — loyalty/cuts refresh automatically after checkout
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('profile-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload) => {
        if (payload.new) {
          setUser(prev => ({
            ...prev,
            total_cuts:   payload.new.total_cuts   ?? prev.total_cuts,
            loyalty_cuts: payload.new.loyalty_cuts ?? prev.loyalty_cuts,
            name:         payload.new.name         ?? prev.name,
            bio:          payload.new.bio          ?? prev.bio,
            avatar_url:   payload.new.avatar_url   ?? prev.avatar_url,
            avatarUrl:    payload.new.avatar_url   ?? prev.avatarUrl,
            instagramUrl: payload.new.instagram_url?? prev.instagramUrl,
            tiktokUrl:    payload.new.tiktok_url   ?? prev.tiktokUrl,
            whatsappPhone:payload.new.whatsapp_phone?? prev.whatsappPhone,
          }))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  async function fetchProfile(userId) {
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data) {
        setUser({
          id:           data.id,
          name:         data.name || 'عميل',
          phone:        data.phone,
          birthday:     data.birthday,
          role:         data.role || (data.phone === ADMIN_PHONE ? 'admin' : 'client'),
          avatar_url:   data.avatar_url,
          avatarUrl:    data.avatar_url,
          bio:          data.bio,
          instagramUrl: data.instagram_url,
          tiktokUrl:    data.tiktok_url,
          whatsappPhone:data.whatsapp_phone,
          client_code:  data.client_code,
          total_cuts:   data.total_cuts  ?? 0,
          loyalty_cuts: data.loyalty_cuts ?? 0,
        })
      } else if (err) {
        console.warn('Profile fetch warning:', err)
        // Fallback profile if profile row is still being populated
        const { data: userData } = await supabase.auth.getUser()
        const meta = userData?.user?.user_metadata || {}
        setUser({
          id: userId,
          name: meta.name || 'عميل',
          phone: meta.phone || '',
          birthday: meta.birthday || '',
          role: meta.role || (meta.phone === ADMIN_PHONE ? 'admin' : 'client'),
          total_cuts: 0,
          loyalty_cuts: 0,
        })
      }
    } catch (e) {
      console.error('fetchProfile error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function login(phone, password) {
    setError('')
    const cleanPhone = phone.replace(/\s/g, '')
    const email = phoneToEmail(cleanPhone)

    setLoading(true)
    const { data: authData, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('errPhonePass')
      setLoading(false)
      return false
    }

    if (authData?.user) {
      await fetchProfile(authData.user.id)
    } else {
      setLoading(false)
    }
    return true
  }

  async function signup({ name, phone, password, birthday }) {
    setError('')
    const cleanPhone = phone.replace(/\s/g, '')
    const email = phoneToEmail(cleanPhone)

    // Determine role — admin phone gets admin role
    const role = cleanPhone === ADMIN_PHONE ? 'admin' : 'client'

    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone: cleanPhone, birthday, role },
      },
    })

    if (err) {
      console.error('Signup error:', err)
      if (err.message.includes('already registered') || err.message.includes('already been registered')) {
        setError('errPhoneUsed')
      } else if (err.message.includes('Password should be')) {
        setError('errMinPass')
      } else {
        setError(err.message)
      }
      return false
    }
    return true
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setError('')
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, setError, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
