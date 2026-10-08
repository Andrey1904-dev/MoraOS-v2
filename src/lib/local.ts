import type { AuthApi, AuthUser, Backend } from './backend'

/**
 * Локальный демо-бэкенд: только сессия в localStorage.
 *
 * Включается, когда переменные VITE_SUPABASE_* не заданы, либо когда
 * пользователь сам нажал «Explore demo mode» (см. src/lib/index.ts).
 * Данные предметной области демо-режима живут в `src/repositories/demo.ts`
 * поверх датасета `src/data/*` — здесь только аутентификация.
 */

const SESSION_KEY = 'mara_demo_session'

export const DEMO_USER: AuthUser = { id: 'demo-user', email: 'demo@mara.app' }

/** Учётка демо-кабинета (пароль не проверяется — данные лежат в браузере) */
export const DEMO_CREDENTIALS = { email: 'demo@mara.app', password: 'demo' } as const

function readSession(): AuthUser | null {
  try {
    return localStorage.getItem(SESSION_KEY) === DEMO_USER.id ? DEMO_USER : null
  } catch {
    return null
  }
}

function writeSession(on: boolean): void {
  try {
    if (on) localStorage.setItem(SESSION_KEY, DEMO_USER.id)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* localStorage может быть недоступен (приватный режим) */
  }
}

const demoAuth: AuthApi = {
  async getUser() {
    return readSession()
  },

  async getAccessToken() {
    return null
  },

  async signIn(email, _password) {
    // Демо-режим не проверяет пароль: всё локально, выход — через signOut.
    void email
    writeSession(true)
    return DEMO_USER
  },

  async signUp(email, _password) {
    writeSession(true)
    return { user: { ...DEMO_USER, email }, session: true, confirmationSent: false }
  },

  async signOut() {
    writeSession(false)
  },

  onChange(_cb) {
    // Локальная сессия не меняется подпиской — состояние контролирует AuthContext.
    void _cb
    return () => {}
  },

  async getSettings() {
    return { autoconfirm: true, signupDisabled: false }
  },

  async resendConfirmation() {
    /* писем в демо-режиме нет */
  },
}

export function createLocalBackend(): Backend {
  return { mode: 'demo', auth: demoAuth }
}
