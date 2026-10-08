import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getBackend, isDemoActive, isDemoOnly, setDemoMode, subscribeBackend } from '../lib'
import type { AuthSettings, AuthUser, Backend, SignUpResult } from '../lib/backend'
import { AuthProblem, toAuthProblem } from '../lib/authErrors'
import { DEMO_CREDENTIALS } from '../lib/local'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  mode: 'supabase' | 'demo'
  /** Демо — единственный доступный режим (сборка без ключей Supabase) */
  demoOnly: boolean
  /** Активный бэкенд: им же пользуется AppDataProvider, чтобы режимы не разъезжались */
  backend: Backend
  /** Публичные настройки Auth проекта (null — пока не загружены / недоступны) */
  settings: AuthSettings | null
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<SignUpResult>
  signOut(): Promise<void>
  enterDemo(): Promise<void>
  /** Выйти из демо-режима, не трогая сессию (используется экраном входа) */
  leaveDemo(): void
  resendConfirmation(email: string): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Локальный анти-спам: Supabase разрешает повторную отправку письма одному
 * пользователю не чаще раза в минуту, а встроенный отправитель — всего
 * 2 письма в час на проект. Поэтому «лишние» попытки гасим ещё на клиенте,
 * чтобы не тратить лимит и не получать 429 (email rate limit exceeded).
 */
const COOLDOWN_KEY = 'mara.auth.lastMailAt'
const COOLDOWN_SEC = 60

export function mailCooldownLeft(): number {
  try {
    const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0)
    if (!last) return 0
    const left = Math.ceil((last + COOLDOWN_SEC * 1000 - Date.now()) / 1000)
    return left > 0 ? left : 0
  } catch {
    return 0
  }
}

function markMailSent() {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
  } catch {
    /* localStorage может быть недоступен */
  }
}

function guardCooldown() {
  const left = mailCooldownLeft()
  if (left > 0) {
    throw new AuthProblem('too_soon', `Письмо уже отправлено — повторите через ${left} с`, {
      detail:
        'Supabase принимает повторную отправку не чаще раза в минуту. ' +
        'Проверьте входящие и папку «Спам».',
      retryAfterSec: left,
      mailIssue: true,
    })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // бэкенд живёт в состоянии: переключение «демо ⇄ Supabase» происходит на лету
  const [backend, setBackend] = useState<Backend>(() => getBackend())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AuthSettings | null>(null)

  // внешние переключения режима (setDemoMode) синхронизируем с состоянием
  useEffect(() => subscribeBackend(() => setBackend(getBackend())), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    backend.auth
      .getUser()
      .then((u) => {
        if (alive) setUser(u)
      })
      .catch(() => {
        if (alive) setUser(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    backend.auth
      .getSettings()
      .then((s) => {
        if (alive) setSettings(s)
      })
      .catch(() => {})
    const unsub = backend.auth.onChange((u) => setUser(u))
    return () => {
      alive = false
      unsub()
    }
  }, [backend])

  /** Вход в локальный демо-кабинет — работает в любой сборке, даже с ключами Supabase */
  const enterDemo = useCallback(async () => {
    setDemoMode(true)
    const demo = getBackend()
    try {
      const demoUser = await demo.auth.signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
      setBackend(demo)
      setUser(demoUser)
    } catch (e) {
      // не оставляем приложение в «демо без сессии»: иначе форма входа
      // будет обращаться к localStorage вместо Supabase
      setDemoMode(false)
      setBackend(getBackend())
      throw e
    }
  }, [])

  /** Возврат в облачный режим с экрана входа (демо-сессии нет — терять нечего) */
  const leaveDemo = useCallback(() => {
    if (isDemoOnly()) return
    setDemoMode(false)
    setBackend(getBackend())
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    mode: backend.mode,
    demoOnly: isDemoOnly(),
    backend,
    settings,
    async signIn(email, password) {
      setUser(await backend.auth.signIn(email, password))
    },
    async signUp(email, password) {
      // регистрация с включённым подтверждением = отправка письма
      if (settings?.autoconfirm !== true) guardCooldown()
      let result: SignUpResult
      try {
        result = await backend.auth.signUp(email, password)
      } catch (e) {
        const problem = toAuthProblem(e)
        // лимит писем израсходован — следующая попытка раньше чем через минуту
        // всё равно упрётся в лимит, поэтому взводим локальный таймер
        if (problem.mailIssue) markMailSent()
        throw problem
      }
      if (result.confirmationSent) markMailSent()
      // если в проекте включено подтверждение email, сессии пока нет —
      // пользователя пускаем в приложение только после подтверждения и входа
      if (result.session) setUser(result.user)
      return result
    },
    async signOut() {
      await backend.auth.signOut()
      setUser(null)
      // выход из демо возвращает приложение в облачный режим
      if (isDemoActive() && !isDemoOnly()) {
        setDemoMode(false)
        setBackend(getBackend())
      }
    },
    enterDemo,
    leaveDemo,
    async resendConfirmation(email) {
      guardCooldown()
      try {
        await backend.auth.resendConfirmation(email)
        markMailSent()
      } catch (e) {
        const problem = toAuthProblem(e)
        if (problem.mailIssue) markMailSent()
        throw problem
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}
