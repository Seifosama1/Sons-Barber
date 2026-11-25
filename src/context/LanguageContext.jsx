import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import translations from '../lib/translations'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  // Read from localStorage first (works before login too)
  const [lang, setLangState] = useState(
    () => localStorage.getItem('lang') || 'ar'
  )

  // Apply direction to <html> whenever lang changes
  useEffect(() => {
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  // t(key, vars?) — returns translated string, interpolates {var} placeholders
  const t = useCallback((key, vars) => {
    const str = translations[lang]?.[key] ?? translations['ar'][key] ?? key
    if (!vars) return str
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      str
    )
  }, [lang])

  // ta(key) — returns array (for days/months)
  const ta = useCallback((key) => {
    return translations[lang]?.[key] ?? translations['ar'][key] ?? []
  }, [lang])

  async function setLang(newLang, userId) {
    setLangState(newLang)
    localStorage.setItem('lang', newLang)
    // Persist to DB if user is logged in
    if (userId) {
      await supabase.from('profiles').update({ lang: newLang }).eq('id', userId)
    }
  }

  // Sync lang from DB profile after login
  async function syncLangFromProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('lang')
      .eq('id', userId)
      .single()
    if (data?.lang && data.lang !== lang) {
      setLangState(data.lang)
      localStorage.setItem('lang', data.lang)
    }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, ta, syncLangFromProfile }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
