import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { BoardPage } from './pages/BoardPage'
import { CvPage } from './pages/CvPage'
import { SettingsPage } from './pages/SettingsPage'

function LoginRoute() {
  const { status } = useAuth()
  if (status === 'authenticated') {
    return <Navigate to="/board" replace />
  }
  return <LoginPage />
}

function SignUpRoute() {
  const { status } = useAuth()
  if (status === 'authenticated') {
    return <Navigate to="/board" replace />
  }
  return <SignUpPage />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/signup" element={<SignUpRoute />} />
      <Route
        path="/board"
        element={
          <RequireAuth>
            <AppLayout>
              <BoardPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/cv"
        element={
          <RequireAuth>
            <AppLayout>
              <CvPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/board" replace />} />
      <Route path="*" element={<Navigate to="/board" replace />} />
    </Routes>
  )
}

export default App
