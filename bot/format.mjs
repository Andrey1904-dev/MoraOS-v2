// Shared formatting helpers for the Mara OS Telegram bot.
// `node:crypto` works in both Node.js and Deno (Supabase Edge Functions),
// so this file is copied unchanged into supabase/functions/telegram-api/.
import { createHash, timingSafeEqual } from 'node:crypto'

/** Cryptographically secure random bytes without Buffer. */
function secureRandomBytes(size) {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const dateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Chicago',
})
const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: 'America/Chicago',
})

/** Имя сервиса в /health и логах. Должно совпадать во всех транспортах. */
export const SERVICE_NAME = 'mara-telegram-api'

/**
 * Алфавит кодов привязки — Crockford base32 (без I, L, O, U): 32 символа,
 * 5 бит на символ. Код из 10 символов даёт 50 бит энтропии — перебор
 * недостижим даже при утечке хэшей. 256 делится на 32, поэтому выбор символа
 * по 5 младшим битам байта равномерен.
 */
export const LINK_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const LINK_CODE_LENGTH = 10
export const LINK_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

/**
 * Мягкая нормализация ввода: регистр, пробелы и дефисы не важны, а похожие
 * символы сводятся к алфавиту (O→0, I и L→1). Остальное не «исправляется»,
 * а отвергается проверкой LINK_CODE_PATTERN.
 */
export function normalizeLinkCode(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export function hashLinkCode(value) {
  return createHash('sha256').update(normalizeLinkCode(value), 'utf8').digest('hex')
}

/** Каноническая форма кода: 10 символов без разделителя (хранится и сравнивается так). */
export function createLinkCode(randomBytes = secureRandomBytes) {
  let code = ''
  for (const byte of randomBytes(LINK_CODE_LENGTH)) {
    code += LINK_CODE_ALPHABET[byte & 31]
  }
  return code
}

/** Вид для человека: `ABCDE-FGHJK`. Разделитель добавляется только в тексте сообщения. */
export function formatLinkCode(code) {
  const value = String(code ?? '')
  return `${value.slice(0, 5)}-${value.slice(5)}`
}

/**
 * Сравнение секретов за постоянное время. Сравниваем SHA-256 от обеих строк,
 * поэтому длина секрета не утекает через время ответа.
 */
export function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a ?? ''), 'utf8').digest()
  const right = createHash('sha256').update(String(b ?? ''), 'utf8').digest()
  return timingSafeEqual(left, right)
}

/**
 * Имя аккаунта Telegram для предпросмотра при привязке: «Anna (@anna)».
 * Управляющие символы убираются, длина ограничивается — значение попадает
 * в интерфейс и в базу, поэтому оно считается недоверенным.
 */
export function telegramDisplayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  const handle = user?.username ? `@${String(user.username)}` : ''
  return [name, handle]
    .filter(Boolean)
    .join(' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 80)
}

export function formatMoney(value) {
  return moneyFormat.format(Math.round(Number(value) || 0))
}

/** "October 8, 2026" or '—' for missing dates. */
export function formatDate(value) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormat.format(date)
}

/** "October" — month headings for revenue screens. */
export function formatMonth(value) {
  const date = value instanceof Date ? value : new Date(value)
  return monthFormat.format(date)
}

export function daysUntil(value, now = new Date()) {
  if (!value) return null
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const target = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / 86_400_000)
}

/** Rows whose `field` timestamp falls inside the current UTC month. */
export function inCurrentMonth(rows, field, now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  return rows.filter((item) => {
    const time = new Date(item[field]).getTime()
    return Number.isFinite(time) && time >= start && time <= now.getTime()
  })
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** English plural: plural(2, 'task') → 'tasks' with irregulars supported. */
export function plural(value, one, many = `${one}s`) {
  return Math.abs(Number(value)) === 1 ? one : many
}

/* ------------------------------------------------------- Telegram Mini App --- */

/**
 * Short screen keys the site accepts in `?screen=` (web_app buttons) and
 * `startapp` (deep links). Must stay in sync with START_ROUTES in
 * src/lib/telegram-mini-app.ts — tests/telegram.test.mjs asserts it.
 */
export const MINI_APP_SCREENS = Object.freeze([
  'home',
  'fans',
  'messages',
  'content',
  'analytics',
  'tasks',
  'ai',
  'settings',
  'telegram',
])

/** Label of the bot menu button that opens the Mini App. */
export const MINI_APP_MENU_TEXT = 'Mara OS'

const LOCAL_HOST_RE = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])$/i

/**
 * Validates and normalizes the public site URL for `web_app` buttons.
 * Telegram only opens Mini Apps over HTTPS; the hash is stripped because
 * Telegram puts launch parameters there (and the site uses HashRouter).
 * Returns '' for empty, non-HTTPS, local, or malformed URLs.
 */
export function normalizeMiniAppUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' || url.username || url.password) return ''
  if (!url.hostname || LOCAL_HOST_RE.test(url.hostname)) return ''
  url.hash = ''
  return url.toString()
}

/**
 * Mini App URL (optionally with a `?screen=<key>` from the whitelist).
 * Unknown screens are ignored: the app opens on its start screen.
 */
export function miniAppUrl(webAppUrl, screen = '') {
  const base = normalizeMiniAppUrl(webAppUrl)
  if (!base) return ''
  if (!screen || !MINI_APP_SCREENS.includes(screen)) return base
  const url = new URL(base)
  url.searchParams.set('screen', screen)
  return url.toString()
}

/**
 * Menu button for setChatMenuButton: Mini App when the URL is valid,
 * otherwise the plain command list (plus a marker for logs).
 */
export function miniAppMenuButton(webAppUrl, text = MINI_APP_MENU_TEXT) {
  const url = normalizeMiniAppUrl(webAppUrl)
  if (!url) return { type: 'commands' }
  return { type: 'web_app', text, web_app: { url } }
}
