/**
 * HTTP-слой API Telegram-ассистента. Один и тот же код работает в двух транспортах:
 *   • bot/server.mjs — Node.js (long polling, API для сайта);
 *   • supabase/functions/telegram-api/ — Supabase Edge Function (webhook + API).
 *
 * Файлы bot/api.mjs, bot/core.mjs и bot/format.mjs копируются в функцию командой
 * `npm run sync:edge`; tests/telegram.test.mjs проверяет, что копии совпадают.
 *
 * Здесь: таблица маршрутов с разрешёнными методами, CORS по allowlist, порядок
 * «авторизация → лимит → тело запроса», проверка webhook-секрета за постоянное
 * время и безопасные ответы об ошибках (без текстов исключений и внутренних URL).
 */
import { ApiError, readBearerToken } from './core.mjs'
import { SERVICE_NAME, safeEqual } from './format.mjs'

export { SERVICE_NAME }

/** Потолок тела запроса. Все запросы API укладываются в несколько сотен байт. */
export const MAX_BODY_BYTES = 4 * 1024

/**
 * Попытки привязки (предпросмотр и подтверждение вместе) на один аккаунт сайта.
 * Счётчик общий для всех экземпляров функции — в Postgres, не в памяти.
 */
export const LINK_ATTEMPT_LIMIT = Object.freeze({ limit: 10, windowSeconds: 10 * 60 })

/** Маршруты API и разрешённые для них методы. Всё остальное — 404 или 405. */
export const API_ROUTES = Object.freeze({
  '/health': Object.freeze(['GET']),
  '/api/telegram/link/status': Object.freeze(['GET']),
  '/api/telegram/link/preview': Object.freeze(['POST']),
  '/api/telegram/link/confirm': Object.freeze(['POST']),
  '/api/telegram/link': Object.freeze(['DELETE']),
})

/** Пути, по которым Telegram доставляет обновления (только webhook-транспорт). */
export const WEBHOOK_ROUTES = Object.freeze(['/', '/telegram'])

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
})

const CORS_REQUEST_HEADERS = 'Authorization, Content-Type'

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...headers,
    },
  })
}

/**
 * Разрешённые origin: адрес сайта (WEB_APP_URL), явный список CORS_ALLOWED_ORIGINS
 * и localhost — только при ALLOW_LOCAL_ORIGINS=1 (локальная разработка).
 */
export function buildAllowedOrigins({ webAppUrl = '', extra = '', allowLocal = false } = {}) {
  const origins = new Set()
  if (allowLocal) {
    origins.add('http://localhost:5173')
    origins.add('http://127.0.0.1:5173')
  }
  for (const item of String(extra ?? '').split(',')) {
    const origin = item.trim().replace(/\/+$/, '')
    if (origin) origins.add(origin)
  }
  if (webAppUrl) {
    try {
      origins.add(new URL(webAppUrl).origin)
    } catch {
      // Некорректный WEB_APP_URL отмечается при запуске транспорта.
    }
  }
  return origins
}

/** Путь внутри функции: убирает префиксы вида /functions/v1/<slug>. */
export function routeOf(pathname, basePaths = []) {
  const path = pathname || '/'
  for (const base of basePaths) {
    if (path === base) return '/'
    if (path.startsWith(`${base}/`)) return path.slice(base.length) || '/'
  }
  return path
}

/** Ограничение тела: заголовок Content-Length, затем фактический размер после чтения. */
async function readJson(request) {
  const contentType = String(request.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('application/json')) {
    throw new ApiError(415, 'Expected a JSON request body.')
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'Request body is too large.')
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new ApiError(413, 'Request body is too large.')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, 'Malformed JSON.')
  }
}

/**
 * Проверка лимита попыток привязки. Вызывается ПОСЛЕ проверки сессии, поэтому
 * анонимный поток не расходует лимит аккаунта, а лимит привязан к пользователю.
 */
export async function enforceLinkAttemptLimit(bot, userId) {
  const allowed = await bot.consumeRateLimit(
    `telegram-link:${userId}`,
    LINK_ATTEMPT_LIMIT.limit,
    LINK_ATTEMPT_LIMIT.windowSeconds,
  )
  if (!allowed) {
    throw new ApiError(429, 'Too many attempts. Wait 10 minutes and try again.')
  }
}

/**
 * /health для webhook-режима. Наружу — только состояние: без URL webhook,
 * без текста последней ошибки Telegram (он уходит в лог сервера).
 */
export function createWebhookHealth({ bot, configured, now = () => Date.now(), logger = console, ttlMs = 60_000 }) {
  let cache = { at: 0, info: null }

  async function webhookInfo() {
    if (cache.info && now() - cache.at < ttlMs) return cache.info
    try {
      const info = await bot.telegramCall('getWebhookInfo')
      cache = { at: now(), info }
      return info
    } catch (error) {
      logger.warn?.('[health] getWebhookInfo failed:', error instanceof Error ? error.message : 'unknown error')
      return null
    }
  }

  return async function health() {
    if (!configured) {
      return {
        status: 503,
        body: {
          ok: false,
          service: SERVICE_NAME,
          mode: 'webhook',
          configured: false,
          botPolling: 'stopped',
          lastSuccessfulPollAt: null,
          hint: 'TELEGRAM_BOT_TOKEN is not set for the telegram-api function.',
        },
      }
    }
    const info = await webhookInfo()
    const url = String(info?.url ?? '')
    const lastErrorAt = Number(info?.last_error_date ?? 0) * 1000
    const degraded = lastErrorAt > 0 && now() - lastErrorAt < 10 * 60_000
    if (degraded) {
      logger.warn?.('[health] Telegram reports a recent delivery error:', String(info?.last_error_message ?? '').slice(0, 200))
    }
    const ok = url.length > 0 && !degraded
    return {
      status: ok ? 200 : 503,
      body: {
        ok,
        service: SERVICE_NAME,
        mode: 'webhook',
        configured: true,
        botPolling: !url ? 'stopped' : degraded ? 'degraded' : 'online',
        lastSuccessfulPollAt: null,
        ...(url ? {} : { hint: 'Webhook is not set. Run scripts/telegram-bot-setup.mjs.' }),
      },
    }
  }
}

/**
 * Собирает обработчик API. Транспорт передаёт:
 *   bot            — экземпляр createBot() из core.mjs;
 *   allowedOrigins — Set из buildAllowedOrigins();
 *   health         — async () => ({ status, body }) для GET /health;
 *   webhook        — { secret, enabled } для приёма обновлений Telegram;
 *   basePaths      — префиксы, которые нужно снять с пути (Edge Function).
 */
export function createTelegramApi({
  bot,
  allowedOrigins = new Set(),
  health,
  webhook = { enabled: false, secret: '' },
  basePaths = [],
  logger = console,
}) {
  async function handleWebhook(request) {
    const provided = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
    if (!webhook.secret || !safeEqual(provided, webhook.secret)) {
      return jsonResponse(403, { error: 'Forbidden.' })
    }
    let update
    try {
      update = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Malformed update.' })
    }
    try {
      await bot.handleUpdate(update)
    } catch (error) {
      logger.error?.('[telegram] update handler failed:', error instanceof Error ? error.message : 'unknown error')
      const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id
      if (chatId) {
        try {
          await bot.sendMessage(chatId, 'The service is temporarily unavailable. Please try again shortly.')
        } catch {
          // Telegram недоступен — апдейт будет повторён вебхуком.
        }
      }
    }
    // Telegram считает доставку успешной только при 2xx: отдаём 200 даже при сбое
    // обработки, иначе апдейт придёт повторно и пользователь получит дубли.
    return jsonResponse(200, { ok: true })
  }

  async function dispatch(route, request) {
    const token = readBearerToken(request.headers.get('authorization'))
    switch (route) {
      case '/health':
        return health()
      case '/api/telegram/link/status':
        return { status: 200, body: await bot.linkStatus(token) }
      case '/api/telegram/link':
        return { status: 200, body: await bot.unlink(token) }
      case '/api/telegram/link/preview':
      case '/api/telegram/link/confirm': {
        const user = await bot.verifySiteSession(token)
        await enforceLinkAttemptLimit(bot, user.id)
        const body = await readJson(request)
        const result = route.endsWith('/preview')
          ? await bot.previewLinkForUser(body?.code)
          : await bot.confirmLinkForUser(user.id, body?.code)
        return { status: 200, body: result }
      }
      default:
        throw new ApiError(404, 'Route not found.')
    }
  }

  return async function handle(request) {
    const url = new URL(request.url)
    const route = routeOf(url.pathname, basePaths)
    const origin = request.headers.get('origin')

    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { error: 'Origin is not allowed.' })
    }
    const cors = { Vary: 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) }

    if (webhook.enabled && WEBHOOK_ROUTES.includes(route)) {
      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
      }
      return handleWebhook(request)
    }

    const methods = API_ROUTES[route]
    if (!methods) return jsonResponse(404, { error: 'Route not found.' }, cors)

    if (request.method === 'OPTIONS') {
      if (!origin) return jsonResponse(404, { error: 'Route not found.' }, cors)
      return new Response(null, {
        status: 204,
        headers: {
          ...SECURITY_HEADERS,
          ...cors,
          'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
          'Access-Control-Allow-Headers': CORS_REQUEST_HEADERS,
          'Access-Control-Max-Age': '600',
        },
      })
    }

    if (!methods.includes(request.method)) {
      return jsonResponse(405, { error: 'Method not allowed.' }, { ...cors, Allow: methods.join(', ') })
    }

    try {
      const { status, body } = await dispatch(route, request)
      return jsonResponse(status, body, cors)
    } catch (error) {
      // ApiError несёт текст, составленный для пользователя (без деталей инфраструктуры).
      if (error instanceof ApiError) {
        if (error.status >= 500) logger.error?.('[api] upstream failure:', error.message)
        return jsonResponse(error.status, { error: error.message }, cors)
      }
      // Всё остальное — общий текст; детали остаются в логе сервера.
      logger.error?.('[api] unexpected error:', error instanceof Error ? error.message : 'unknown error')
      return jsonResponse(500, { error: 'Internal server error.' }, cors)
    }
  }
}
