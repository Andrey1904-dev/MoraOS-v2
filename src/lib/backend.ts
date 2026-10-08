export interface AuthUser {
  id: string
  email: string
}

export interface SignUpResult {
  user: AuthUser
  /** false — требуется подтверждение email, сессия ещё не создана */
  session: boolean
  /** true — письмо с подтверждением было отправлено этой регистрацией */
  confirmationSent: boolean
}

/** Публичные настройки Supabase Auth (GET /auth/v1/settings) */
export interface AuthSettings {
  /** true — подтверждение email выключено, письма не отправляются вообще */
  autoconfirm: boolean
  /** true — регистрация новых пользователей запрещена в проекте */
  signupDisabled: boolean
}

export interface AuthApi {
  getUser(): Promise<AuthUser | null>
  /** Токен текущей облачной сессии; null в локальном демо-режиме */
  getAccessToken(): Promise<string | null>
  signIn(email: string, password: string): Promise<AuthUser>
  signUp(email: string, password: string): Promise<SignUpResult>
  signOut(): Promise<void>
  onChange(cb: (user: AuthUser | null) => void): () => void
  /** Настройки Auth проекта; null — если получить не удалось */
  getSettings(): Promise<AuthSettings | null>
  /** Повторная отправка письма с подтверждением регистрации */
  resendConfirmation(email: string): Promise<void>
}

/**
 * Бэкенд Mara OS — только аутентификация.
 *
 * Предметные данные (fans, контент, выручка, AI) проходят через уровень
 * репозиториев `src/repositories`, который сам выбирает реализацию
 * (Supabase или локальный демо-стор) по текущему режиму — как раньше
 * это делал `getBackend()`.
 */
export interface Backend {
  mode: 'supabase' | 'demo'
  auth: AuthApi
}
