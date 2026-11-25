import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import ClientPage from './pages/ClientPage'
import BarberPage from './pages/BarberPage'
import LanguagePicker from './pages/LanguagePicker'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider, useLang } from './context/LanguageContext'
import './styles/spinner.css'

function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (role && user.role !== role) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'barber') return <Navigate to="/barber" replace />
    return <Navigate to="/client" replace />
  }
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const { syncLangFromProfile } = useLang()

  // Sync language from DB when user logs in
  if (user?.id) syncLangFromProfile(user.id)

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner" />
      </div>
    )
  }

  function homeRedirect() {
    if (!user) return <AuthPage />
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'barber') return <Navigate to="/barber" replace />
    return <Navigate to="/client" replace />
  }

  return (
    <Routes>
      <Route path="/" element={homeRedirect()} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
      <Route path="/client/*" element={<ProtectedRoute role="client"><ClientPage /></ProtectedRoute>} />
      <Route path="/barber/*" element={<ProtectedRoute role="barber"><BarberPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppWithLangCheck() {
  // Show language picker only once — if no lang stored yet
  const hasLang = localStorage.getItem('lang')
  const [pickerDone, setPickerDone] = useState(!hasLang ? false : true)

  if (!pickerDone) {
    return <LanguagePicker onDone={() => setPickerDone(true)} />
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppWithLangCheck />
    </LanguageProvider>
  )
}
