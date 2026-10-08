/**
 * Node.js-транспорт Telegram-ассистента Mara OS: long polling + HTTP API для сайта.
 *
 * Вся логика (тексты, команды, работа с Supabase) живёт в `core.mjs`, маршруты и
 * проверки HTTP — в `api.mjs`; их же использует webhook-версия (Edge Function).
 *
 * Запуск: npm run bot:start (переменные окружения см. bot/.env.example)
 */
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createBot } from './core.mjs'
import { MAX_BODY_BYTES, buildAllowedOrigins, createTelegramApi } from './api.mjs'

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
const WEB_APP_URL = (process.env.WEB_APP_URL ?? '').trim()
const PORT = Number(process.env.PORT || 3001)

let polling = true
let pollingStatus = 'starting'
let lastSuccessfulPollAt = null

function validateEnvironment() {
  const missing = []
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY')
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN')
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) missing.push('PORT (1–65535)')
  if (missing.length) {
    throw new Error(`Не заданы переменные окружения: ${missing.join(', ')}. См. bot/.env.example.`)
  }
  if (!SUPABASE_URL.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SUPABASE_URL)) {
    throw new Error('SUPABASE_URL должен быть HTTPS-адресом (локальный HTTP разрешён только для localhost).')
  }
}

/** Превращает IncomingMessage в Web Request; тело ограничено MAX_BODY_BYTES. */
async function toWebRequest(req) {
  const method = req.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else headers.set(name, value)
  }
  const url = new URL(req.url ?? '/', 'http://internal.invalid')
  if (method === 'GET' || method === 'HEAD') {
    return { request: new Request(url, { method, headers }) }
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) return { tooLarge: true }
    chunks.push(chunk)
  }
  return { request: new Request(url, { method, headers, body: Buffer.concat(chunks) }) }
}

async function writeWebResponse(res, response) {
  const headers = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  if (response.status === 204) {
    res.writeHead(204, headers)
    res.end()
    return
  }
  const payload = Buffer.from(await response.arrayBuffer())
  headers['Content-Length'] = String(payload.length)
  res.writeHead(response.status, headers)
  res.end(payload)
}

export async function start() {
  validateEnvironment()
  const bot = createBot({
    telegramToken: TELEGRAM_BOT_TOKEN,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    webAppUrl: WEB_APP_URL,
  })

  const api = createTelegramApi({
    bot,
    allowedOrigins: buildAllowedOrigins({
      webAppUrl: WEB_APP_URL,
      extra: process.env.CORS_ALLOWED_ORIGINS ?? '',
      allowLocal: process.env.ALLOW_LOCAL_ORIGINS === '1',
    }),
    health: async () => {
      const report = bot.healthReport({ mode: 'polling', pollingStatus, lastSuccessfulAt: lastSuccessfulPollAt })
      return { status: report.ok ? 200 : 503, body: report }
    },
  })

  async function pollingLoop() {
    let offset = 0
    while (polling) {
      try {
        const updates = await bot.telegramCall('getUpdates', {
          offset,
          timeout: 45,
          allowed_updates: ['message', 'callback_query'],
        }, 55_000)
        lastSuccessfulPollAt = Date.now()
        pollingStatus = 'online'
        for (const update of updates ?? []) {
          offset = Math.max(offset, Number(update.update_id) + 1)
          try {
            await bot.handleUpdate(update)
          } catch (error) {
            console.error('[telegram] update handler failed:', error instanceof Error ? error.message : 'unknown error')
            const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id
            if (chatId) {
              try {
                await bot.sendMessage(chatId, 'The service is temporarily unavailable. Please try again shortly.')
              } catch {
                // Telegram API недоступен — следующий long-poll запрос повторит связь.
              }
            }
          }
        }
      } catch (error) {
        if (!polling) break
        pollingStatus = 'degraded'
        console.error('[telegram] polling failed:', error instanceof Error ? error.message : 'unknown error')
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
    }
  }

  const botInfo = await bot.telegramCall('getMe')
  await bot.telegramCall('deleteWebhook', { drop_pending_updates: false })
  await bot.applyBotProfile()

  const server = createServer(async (req, res) => {
    try {
      const { request, tooLarge } = await toWebRequest(req)
      if (tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' })
        res.end(JSON.stringify({ error: 'Request body is too large.' }))
        return
      }
      await writeWebResponse(res, await api(request))
    } catch (error) {
      console.error('[api] transport failure:', error instanceof Error ? error.message : 'unknown error')
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      res.end(JSON.stringify({ error: 'Internal server error.' }))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '0.0.0.0', resolve)
  })

  console.log(`Mara OS Telegram API listening on 0.0.0.0:${PORT}`)
  console.log(`Telegram bot @${botInfo.username} is ready.`)
  if (!WEB_APP_URL) console.warn('WEB_APP_URL is empty: the bot will not show the website shortcut button.')
  void pollingLoop()

  const stop = () => {
    polling = false
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2_000).unref()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Bot startup failed.')
    process.exitCode = 1
  })
}
