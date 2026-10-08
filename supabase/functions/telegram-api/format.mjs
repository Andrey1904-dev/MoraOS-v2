// Shared formatting helpers for the Mara OS Telegram bot.
// `node:crypto` works in both Node.js and Deno (Supabase Edge Functions),
// so this file is copied unchanged into supabase/functions/telegram-api/.
import { createHash } from 'node:crypto'

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

export function normalizeLinkCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashLinkCode(value) {
  return createHash('sha256').update(normalizeLinkCode(value), 'utf8').digest('hex')
}

/**
 * Canonical link code: 10 A-Z0-9 chars without a separator. The transport
 * adds the human-readable dash in the message text — formatting it twice
 * used to send codes like `A4K9P--72QX8` to Telegram.
 */
export function createLinkCode(randomBytes = secureRandomBytes) {
  let hex = ''
  for (const byte of randomBytes(5)) {
    hex += Number(byte).toString(16).padStart(2, '0')
  }
  return hex.toUpperCase()
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
