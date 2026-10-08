import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import type { AuthApi, AuthSettings, AuthUser, Backend } from './backend'
import { AuthProblem, toAuthProblem } from './authErrors'
import { normalizeEmail } from './email'

let client: SupabaseClient<Database> | null = null

/** Ленивая инициализация клиента Supabase */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

const toAuthUser = (u: { id: string; email?: string } | null): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? '' } : null

/** Кэш публичных настроек Auth (нужен, чтобы знать, шлёт ли проект письма) */
let settingsCache: AuthSettings | null | undefined

/** Ссылка, на которую вернётся пользователь из письма-подтверждения */
const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined

const supabaseAuth: AuthApi = {
  async getUser() {
    const { data } = await getSupabase().auth.getUser()
    return toAuthUser(data.user)
  },

  async getAccessToken() {
    const { data, error } = await getSupabase().auth.getSession()
    if (error) throw error
    return data.session?.access_token ?? null
  },

  async signIn(email, password) {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    })
    if (error) throw toAuthProblem(error)
    return toAuthUser(data.user)!
  },

  async signUp(email, password) {
    const address = normalizeEmail(email)
    const { data, error } = await getSupabase().auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo },
    })
    if (error) throw toAuthProblem(error)
    if (!data.user) throw new AuthProblem('unknown', 'Could not create the account')

    // Supabase скрывает факт существования аккаунта: при повторной регистрации
    // возвращается пользователь с пустым списком identities и без сессии.
    const alreadyRegistered = Array.isArray(data.user.identities) && data.user.identities.length === 0
    if (alreadyRegistered) {
      throw new AuthProblem('user_exists', 'This email is already registered', {
        detail: 'Sign in with this address instead — no need to register again.',
      })
    }

    const session = data.session !== null
    return { user: toAuthUser(data.user)!, session, confirmationSent: !session }
  },

  async signOut() {
    await getSupabase().auth.signOut()
  },

  onChange(cb) {
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      cb(toAuthUser(session?.user ?? null))
    })
    return () => data.subscription.unsubscribe()
  },

  async getSettings() {
    if (settingsCache !== undefined) return settingsCache
    try {
      const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { mailer_autoconfirm?: boolean; disable_signup?: boolean }
      settingsCache = {
        autoconfirm: json.mailer_autoconfirm === true,
        signupDisabled: json.disable_signup === true,
      }
    } catch {
      settingsCache = null
    }
    return settingsCache
  },

  async resendConfirmation(email) {
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
      options: { emailRedirectTo },
    })
    if (error) throw toAuthProblem(error)
  },
}

/**
 * Гарантирует наличие строки профиля (нужно, если пользователь
 * зарегистрировался до применения схемы — триггер по нему не отработал).
 */
export async function ensureProfile(user: AuthUser): Promise<void> {
  const { error } = await getSupabase()
    .from('profiles')
    .upsert({ id: user.id, email: user.email })
  if (error) throw error
}

export const supabaseBackend: Backend = { mode: 'supabase', auth: supabaseAuth }
