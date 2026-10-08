import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { ToastProvider } from './components/ui/Feedback'
import SplashScreen from './components/SplashScreen'
import TelegramMiniAppBridge from './components/TelegramMiniAppBridge'
import AuthPage from './pages/AuthPage'
import Overview from './pages/Overview'
import Fans from './pages/Fans'
import FanProfile from './pages/FanProfile'
import Conversations from './pages/Conversations'
import Content from './pages/Content'
import ContentEditor from './pages/ContentEditor'
import Episodes from './pages/Episodes'
import Assets from './pages/Assets'
import Offers from './pages/Offers'
import Revenue from './pages/Revenue'
import Analytics from './pages/Analytics'
import AIStudio from './pages/AIStudio'
import Automations from './pages/Automations'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <span className="size-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    // HashRouter — для корректной работы роутинга на GitHub Pages без 404-хака
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <SplashScreen />
          <TelegramMiniAppBridge />
          <Routes>
            <Route
              path="/auth"
              element={
                <RedirectIfAuthed>
                  <AuthPage />
                </RedirectIfAuthed>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Overview />} />
              <Route path="fans" element={<Fans />} />
              <Route path="fans/:id" element={<FanProfile />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="content" element={<Content />} />
              <Route path="content/new" element={<ContentEditor />} />
              <Route path="content/:id" element={<ContentEditor />} />
              <Route path="episodes" element={<Episodes />} />
              <Route path="assets" element={<Assets />} />
              <Route path="offers" element={<Offers />} />
              <Route path="revenue" element={<Revenue />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="ai" element={<AIStudio />} />
              <Route path="automations" element={<Automations />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  )
}
