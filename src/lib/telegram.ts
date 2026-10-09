export type TelegramLinkStatus = {
  linked: boolean
  linkedAt?: string
}

/** Шаг 1 привязки: какой Telegram-аккаунт у введённого кода. Код ещё не потрачен. */
export type TelegramLinkPreview = {
  telegramAccount: string
  expiresAt: string
}

/** Ответ /health. Адрес webhook и текст последней ошибки Telegram сервер не отдаёт. */
export type TelegramApiHealth = {
  ok: boolean
  service?: string
  mode?: 'polling' | 'webhook'
  configured?: boolean
  botPolling?: 'starting' | 'online' | 'degraded' | 'stopped'
  lastSuccessfulPollAt?: string | null
  hint?: string
}

/** Что не так с публичными переменными сборки (пустая строка — всё в порядке). */
export type TelegramConfigIssue =
  | ''
  | 'missing-username'
  | 'missing-url'
  | 'relative-in-prod'
  | 'not-https'
  | 'invalid-url'

const BOT_USERNAME_LIKE = /^[A-Za-z0-9_]{5,32}$/

const rawBotUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '')
const rawApiUrl = (import.meta.env.VITE_TELEGRAM_API_URL ?? '').trim()
const isDev = Boolean(import.meta.env.DEV)

const CONFIG_MESSAGES: Record<Exclude<TelegramConfigIssue, ''>, string> = {
  'missing-username':
    'Задайте имя бота (без @) в переменной сборки VITE_TELEGRAM_BOT_USERNAME.',
  'missing-url':
    'Задайте HTTPS-адрес API бота в VITE_TELEGRAM_API_URL — например, адрес Supabase Edge Function …/functions/v1/telegram-api.',
  'relative-in-prod':
    'VITE_TELEGRAM_API_URL — относительный путь. Он работает только в разработке через прокси Vite. Для опубликованного сайта укажите полный HTTPS-адрес API бота.',
  'not-https':
    'VITE_TELEGRAM_API_URL должен быть HTTPS-адресом: браузеры не отправляют учётные данные по обычному HTTP.',
  'invalid-url': 'VITE_TELEGRAM_API_URL не является корректным URL. Используйте адрес вида https://example.com.',
}

type ApiUrlResult = { url: string; issue: TelegramConfigIssue }

/**
 * Проверяет адрес API до первого запроса.
 *
 * Раньше значение из переменной уходило в `fetch` как есть: относительный путь
 * из `.env.example` уезжал в продакшн-сборку, браузер слал запрос на домен
 * самого сайта (GitHub Pages) и получал 404/405 вместо ответа бота.
 */
export function normalizeTelegramApiUrl(value: string, dev = isDev): ApiUrlResult {
  const raw = value.trim()
  if (!raw) return { url: '', issue: 'missing-url' }
  if (raw.startsWith('/')) {
    return dev
      ? { url: raw.replace(/\/+$/, '') || '/', issue: '' }
      : { url: '', issue: 'relative-in-prod' }
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { url: '', issue: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:') return { url: '', issue: 'not-https' }
  return { url: raw.replace(/\/+$/, ''), issue: '' }
}

const apiUrl = normalizeTelegramApiUrl(rawApiUrl)

/** Публичное имя бота; токен Telegram здесь никогда не хранится. */
export const TELEGRAM_BOT_USERNAME = BOT_USERNAME_LIKE.test(rawBotUsername) ? rawBotUsername : ''
export const TELEGRAM_API_URL = apiUrl.url
export const TELEGRAM_API_HOST = (() => {
  try {
    return new URL(TELEGRAM_API_URL).host
  } catch {
    // Относительный путь в dev-режиме — домен появится только во время запроса.
    return ''
  }
})()
export const TELEGRAM_BOT_URL = TELEGRAM_BOT_USERNAME
  ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=site`
  : ''

/** Одна понятная причина, почему интеграция не готова. */
export const TELEGRAM_CONFIG_ISSUE: TelegramConfigIssue = (() => {
  if (apiUrl.issue) return apiUrl.issue
  if (!TELEGRAM_BOT_USERNAME) return 'missing-username'
  return ''
})()

export const TELEGRAM_CONFIG_MESSAGE = TELEGRAM_CONFIG_ISSUE ? CONFIG_MESSAGES[TELEGRAM_CONFIG_ISSUE] : ''
export const isTelegramConfigured = Boolean(TELEGRAM_BOT_URL && TELEGRAM_API_URL)

function hostLabel(): string {
  return TELEGRAM_API_HOST || 'the configured address'
}

/** Понятное описание HTTP-ответа вместо голого кода. */
export function describeTelegramHttpError(status: number): string {
  if (status === 404) {
    return `The bot API was not found at ${hostLabel()} (404). Check VITE_TELEGRAM_API_URL: it must point to the bot service, not to the website.`
  }
  if (status === 405) {
    return `${hostLabel()} does not accept API requests (405). That is how a static host such as GitHub Pages responds. Check VITE_TELEGRAM_API_URL: it must point to the running bot service.`
  }
  if (status === 401 || status === 403) {
    return 'Сервис бота отклонил сессию сайта. Войдите заново и повторите.'
  }
  if (status === 429) {
    return 'Слишком много попыток. Подождите несколько минут и повторите.'
  }
  if (status >= 500) {
    return `The bot service is temporarily unavailable (${status}). Try again in a minute.`
  }
  return `Could not reach the bot service (${status}).`
}

async function readJsonBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

export async function checkTelegramHealth(): Promise<TelegramApiHealth> {
  if (!TELEGRAM_API_URL) throw new Error(TELEGRAM_CONFIG_MESSAGE || 'The Telegram bot API is not configured.')

  let response: Response
  try {
    response = await fetch(`${TELEGRAM_API_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new Error(`The bot server does not respond (${hostLabel()}). Check the public HTTPS address of the API.`)
  }

  const payload = (await readJsonBody(response)) as TelegramApiHealth | null
  if (!payload || typeof payload.ok !== 'boolean') {
    throw new Error(
      response.ok
        ? `${hostLabel()} responds, but it is not the bot API: the reply is not JSON.`
        : describeTelegramHttpError(response.status),
    )
  }
  return payload
}

export async function requestTelegram<T>(
  path: string,
  accessToken: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  if (!TELEGRAM_API_URL) throw new Error(TELEGRAM_CONFIG_MESSAGE || 'The Telegram bot API is not configured.')

  const response = await fetch(`${TELEGRAM_API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(12_000),
  })

  const payload = (await readJsonBody(response)) as
    | { error?: string; message?: string }
    | null
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || describeTelegramHttpError(response.status))
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${hostLabel()} returned an unexpected reply. Check VITE_TELEGRAM_API_URL.`)
  }

  return payload as T
}

/**
 * Второй шаг привязки начинается с предпросмотра: сервер сообщает, какой аккаунт
 * Telegram запросил код. Пользователь подтверждает именно этот аккаунт.
 */
export function previewTelegramLink(accessToken: string, code: string): Promise<TelegramLinkPreview> {
  return requestTelegram<TelegramLinkPreview>('/api/telegram/link/preview', accessToken, {
    method: 'POST',
    body: { code },
  })
}
