import type { Backend } from './backend'
import { isSupabaseConfigured } from './config'
import { createLocalBackend } from './local'
import { supabaseBackend } from './supabase'

/**
 * Единая точка входа к бэкенду.
 *
 * Раньше выбор был «жёстким»: если ключи Supabase заданы — только Supabase,
 * иначе — localStorage. Из-за этого на опубликованной сборке (а ключи в
 * GitHub Actions задаются всегда) кнопка «Войти в демо-режим» пыталась
 * залогиниться в Supabase под несуществующим `demo@mara.app` и молча падала:
 * демо-режим был недоступен в принципе.
 *
 * Теперь демо — это переключатель во время работы приложения:
 *   • ключей нет            → демо включён принудительно;
 *   • ключи есть            → демо включается кнопкой и запоминается в браузере.
 * Выход из аккаунта возвращает приложение в облачный режим.
 */

const DEMO_FLAG = 'mara_os.demo_mode'

type Listener = () => void
const listeners = new Set<Listener>()

let localBackend: Backend | null = null

/** Пользователь явно попросил демо-режим (флаг сохраняется между перезагрузками) */
export function isDemoRequested(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

/** Демо активен: либо выбран пользователем, либо Supabase не настроен вовсе */
export function isDemoActive(): boolean {
  return !isSupabaseConfigured || isDemoRequested()
}

/** Демо — единственный доступный режим (сборка без ключей Supabase) */
export const isDemoOnly = (): boolean => !isSupabaseConfigured

export function getBackend(): Backend {
  if (isDemoActive()) {
    if (!localBackend) localBackend = createLocalBackend()
    return localBackend
  }
  return supabaseBackend
}

/** Включает/выключает демо-режим и оповещает подписчиков (контексты) */
export function setDemoMode(on: boolean): void {
  if (isDemoOnly()) return // без ключей выключать нечего
  try {
    if (on) localStorage.setItem(DEMO_FLAG, '1')
    else localStorage.removeItem(DEMO_FLAG)
  } catch {
    /* localStorage может быть недоступен (приватный режим) */
  }
  for (const cb of listeners) cb()
}

/** Подписка на смену бэкенда (демо ⇄ Supabase) */
export function subscribeBackend(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
