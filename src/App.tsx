import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { ToastProvider } from './components/ui/Feedback'
import SplashScreen from './components/SplashScreen'
import TelegramMiniAppBridge from './components/TelegramMiniAppBridge'
import AuthPage from './pages/AuthPage'

// Страницы грузятся по маршрутам: в первый экран попадает только вход и оболочка.
const Overview = lazy(() => import('./pages/Overview'))
const Fans = lazy(() => import('./pages/Fans'))
const FanProfile = lazy(() => import('./pages/FanProfile'))
const Conversations = lazy(() => import('./pages/Conversations'))
const Content = lazy(() => import('./pages/Content'))
const ContentEditor = lazy(() => import('./pages/ContentEditor'))
const Episodes = lazy(() => import('./pages/Episodes'))
const Assets = lazy(() => import('./pages/Assets'))
const Offers = lazy(() => import('./pages/Offers'))
const Revenue = lazy(() => import('./pages/Revenue'))
const Analytics = lazy(() => import('./pages/Analytics'))
const AIStudio = lazy(() => import('./pages/AIStudio'))
const Automations = lazy(() => import('./pages/Automations'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Settings = lazy(() => import('./pages/Settings'))

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
          <Suspense fallback={<FullScreenLoader />}>
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
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  )
}
