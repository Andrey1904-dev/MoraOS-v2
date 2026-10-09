/**
 * Smoke-тест Supabase Edge Function «telegram-api».
 *
 * Функция собирается esbuild-ом в Node-бандл, Telegram Bot API и Supabase REST
 * подменяются заглушками, после чего проверяется весь контракт, который
 * использует раздел «Бот»: CORS, /health, привязка по коду, отвязка и
 * обработка webhook-обновлений Telegram.
 *
 * Запуск: node scripts/smoke-telegram-api.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outfile = path.join(root, 'node_modules', '.tmp', 'telegram-api.mjs')

const USER_ID = '22222222-2222-4222-8222-222222222222'
const CHAT_ID = 555_000_111

/* ------------------------------------------------------------- заглушки --- */

let webhookInfo = { url: '', pending_update_count: 0 }
let clock = 1_700_000_000_000
let linkRows = []
let fansRows = []
let linkResult = true
let rateAllowed = true
let previewRow = { telegram_display: 'Anna (@anna)', expires_at: '2099-01-01T00:00:00Z' }
const rateCalls = []
const sentMessages = []
const insertedCodes = []
const telegramMethods = []
const restCalls = []

function json(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

globalThis.fetch = async (url, init = {}) => {
  const href = String(url)
  if (!href.startsWith('https://api.telegram.org/')) restCalls.push(href)
  if (href.startsWith('https://api.telegram.org/')) {
    const method = href.split('/').pop()
    telegramMethods.push(method)
    if (method === 'getWebhookInfo') return json({ ok: true, result: webhookInfo })
    if (method === 'sendMessage' || method === 'sendPhoto' || method === 'editMessageText') {
      sentMessages.push(JSON.parse(init.body))
      return json({ ok: true, result: { message_id: sentMessages.length } })
    }
    return json({ ok: true, result: { id: 1, username: 'MaraOSAssistant_bot' } })
  }
  if (href.includes('/auth/v1/user')) return json({ id: USER_ID, email: 'owner@example.com' })
  if (href.includes('/rest/v1/rpc/link_telegram_account')) return json(linkResult)
  if (href.includes('/rest/v1/rpc/consume_rate_limit')) {
    rateCalls.push(JSON.parse(init.body))
    return json(rateAllowed)
  }
  if (href.includes('/rest/v1/telegram_links')) {
    if (init.method === 'DELETE') return json(linkRows.length ? [{ user_id: USER_ID }] : [])
    return json(linkRows)
  }
  if (href.includes('/rest/v1/telegram_link_codes')) {
    if (init.method === 'POST') {
      insertedCodes.push(JSON.parse(init.body))
      return new Response(null, { status: 201 })
    }
    return json(previewRow ? [previewRow] : [])
  }
  if (href.includes('/rest/v1/fans')) return json(fansRows)
  if (href.includes('/rest/v1/subscriptions')) return json([])
  if (href.includes('/rest/v1/conversations')) return json([])
  if (href.includes('/rest/v1/content')) return json([])
  if (href.includes('/rest/v1/revenue_events')) return json([])
  if (href.includes('/rest/v1/tasks')) return json([])
  if (href.includes('/rest/v1/ai_runs')) return json([])
  throw new Error(`unexpected fetch: ${href}`)
}

globalThis.Deno = { env: { get: () => undefined } }

await build({
  entryPoints: [path.join(root, 'supabase', 'functions', 'telegram-api', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'error',
})

const { createApp } = await import(pathToFileURL(outfile).href)

const ORIGIN = 'https://andrey1904-dev.github.io'
const BASE = 'https://dcgurmwvpgzmlfivxoso.supabase.co/functions/v1/telegram-api'

const app = createApp({
  supabaseUrl: 'https://dcgurmwvpgzmlfivxoso.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabaseServiceRoleKey: 'service-role-key',
  telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
  webhookSecret: 'webhook-secret',
  webAppUrl: 'https://andrey1904-dev.github.io/MoraOS-v2/',
  fetchImpl: (...args) => globalThis.fetch(...args),
  now: () => clock,
  logger: { warn() {}, error() {} },
})

const call = (route, init = {}) => app(new Request(`${BASE}${route}`, init))
const bearer = { Authorization: 'Bearer site-access-token' }

let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`OK   ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ тесты --- */

{
  const response = await call('/health', { method: 'OPTIONS', headers: { origin: ORIGIN } })
  check('предполётный OPTIONS отвечает 204', response.status === 204, `status=${response.status}`)
  check(
    'CORS разрешает origin GitHub Pages',
    response.headers.get('access-control-allow-origin') === ORIGIN,
    String(response.headers.get('access-control-allow-origin')),
  )
  check(
    'CORS разрешает заголовок Authorization',
    String(response.headers.get('access-control-allow-headers')).includes('Authorization'),
  )
}

{
  const response = await call('/health', { headers: { origin: 'https://evil.example' } })
  check('чужой origin отклоняется', response.status === 403, `status=${response.status}`)
}

{
  webhookInfo = { url: '', pending_update_count: 3 }
  const response = await call('/health', { headers: { origin: ORIGIN } })
  const body = await response.json()
  check('без webhook /health отвечает 503', response.status === 503, `status=${response.status}`)
  check('без webhook статус stopped', body.botPolling === 'stopped', body.botPolling)
  check('подсказка про setWebhook заполнена', typeof body.hint === 'string' && body.hint.length > 0)
}

{
  clock += 61_000 // кэш getWebhookInfo живёт минуту — сдвигаем часы
  webhookInfo = { url: `${BASE}`, pending_update_count: 0 }
  const response = await call('/health', { headers: { origin: ORIGIN } })
  const body = await response.json()
  check('с настроенным webhook /health отвечает 200', response.status === 200, `status=${response.status}`)
  check('режим webhook указан в ответе', body.mode === 'webhook', String(body.mode))
  check('бот считается онлайн', body.botPolling === 'online', String(body.botPolling))
}

{
  const response = await call('/api/telegram/link/status', { headers: { origin: ORIGIN } })
  check('без access token статус 401', response.status === 401, `status=${response.status}`)
}

{
  linkRows = [{ linked_at: '2026-09-30T05:00:00.000Z' }]
  const response = await call('/api/telegram/link/status', {
    headers: { origin: ORIGIN, ...bearer },
  })
  const body = await response.json()
  check('со статусом linked=true отвечает 200', response.status === 200, `status=${response.status}`)
  check('дата привязки передана', body.linked === true && Boolean(body.linkedAt))
}

{
  const response = await call('/api/telegram/link/confirm', {
    method: 'POST',
    headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'abc' }),
  })
  check('слишком короткий код отклоняется', response.status === 400, `status=${response.status}`)
}

{
  linkResult = true
  const response = await call('/api/telegram/link/confirm', {
    method: 'POST',
    headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'A4K9P-72QX8' }),
  })
  const body = await response.json()
  check('корректный код привязывает аккаунт', response.status === 200 && body.linked === true, `status=${response.status}`)
}

{
  linkResult = false
  const response = await call('/api/telegram/link/confirm', {
    method: 'POST',
    headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ZZZZZ-ZZZZZ' }),
  })
  check('просроченный код возвращает 400', response.status === 400, `status=${response.status}`)
  linkResult = true
}

{
  linkRows = [{ linked_at: '2026-09-30T05:00:00.000Z' }]
  const response = await call('/api/telegram/link', {
    method: 'DELETE',
    headers: { origin: ORIGIN, ...bearer },
  })
  check('DELETE снимает привязку', response.status === 200, `status=${response.status}`)
}

{
  const response = await call('/api/telegram/unknown', { headers: { origin: ORIGIN, ...bearer } })
  check('неизвестный маршрут возвращает 404', response.status === 404, `status=${response.status}`)
}

{
  const response = await call('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: 1 }),
  })
  check('webhook без секретного заголовка отклоняется', response.status === 403, `status=${response.status}`)
}

{
  sentMessages.length = 0
  linkRows = []
  const response = await call('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' },
    body: JSON.stringify({
      update_id: 10,
      message: {
        message_id: 1,
        from: { id: 42, first_name: 'Ann' },
        chat: { id: CHAT_ID, type: 'private' },
        text: '/link',
      },
    }),
  })
  const text = sentMessages.map((message) => message.text ?? message.caption ?? '').join('\n')
  check('webhook принимает update от Telegram', response.status === 200, `status=${response.status}`)
  check('по /link бот отправляет код', /КОД ПРИВЯЗКИ/.test(text), text.slice(0, 80))
  check('код сохранён в таблицу с хэшем', insertedCodes.length === 1 && /^[0-9a-f]{64}$/.test(insertedCodes[0].code_hash))
  check('код привязан к чату Telegram', insertedCodes[0]?.telegram_chat_id === CHAT_ID)
  check('getWebhookInfo вызывается для /health', telegramMethods.includes('getWebhookInfo'))
}

{
  sentMessages.length = 0
  linkRows = []
  fansRows = [
    { relationship_level: 'visitor', joined_at: '2026-10-01' },
    { relationship_level: 'inner_circle', joined_at: '2026-10-05' },
  ]
  await call('/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' },
    body: JSON.stringify({
      update_id: 11,
      message: {
        message_id: 2,
        from: { id: 42, first_name: 'Ann' },
        chat: { id: CHAT_ID, type: 'private' },
        text: '/fans',
      },
    }),
  })
  const text = sentMessages.map((message) => message.text ?? message.caption ?? '').join('\n')
  check('непривязанный чат получает просьбу подключить сайт', /НЕ ПОДКЛЮЧЕНО/.test(text), text.slice(0, 80))

  sentMessages.length = 0
  linkRows = [{ user_id: USER_ID }]
  await call('/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' },
    body: JSON.stringify({
      update_id: 12,
      message: {
        message_id: 3,
        from: { id: 42, first_name: 'Ann' },
        chat: { id: CHAT_ID, type: 'private' },
        text: '/fans',
      },
    }),
  })
  const linkedText = sentMessages.map((message) => message.text ?? message.caption ?? '').join('\n')
  check('привязанный чат получает сводку аудитории', /Всего аудитория — <b>2<\/b>/.test(linkedText), linkedText.slice(0, 120))
}

{
  sentMessages.length = 0
  await call('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' },
    body: JSON.stringify({
      update_id: 13,
      callback_query: {
        id: 'cb-1',
        from: { id: 42, first_name: 'Ann' },
        data: 'analytics',
        message: { message_id: 4, chat: { id: CHAT_ID, type: 'private' } },
      },
    }),
  })
  check('callback_query подтверждается', telegramMethods.includes('answerCallbackQuery'))
  check('кнопка «Analytics» отвечает экраном выручки', sentMessages.length >= 1)
}


/* ------------------------------------------- маршруты, методы и лимиты --- */
{
  const get = await call('/api/telegram/link', { method: 'GET', headers: { origin: ORIGIN, ...bearer } })
  check('GET /api/telegram/link → 405 (отвязка только DELETE)', get.status === 405, `status=${get.status}`)
  check('405 содержит заголовок Allow: DELETE', get.headers.get('allow') === 'DELETE', String(get.headers.get('allow')))
  const health = await call('/health', { method: 'POST' })
  check('POST /health → 405', health.status === 405, `status=${health.status}`)
  const status = await call('/api/telegram/link/status', { method: 'POST', headers: bearer })
  check('POST /api/telegram/link/status → 405', status.status === 405, `status=${status.status}`)
  const evil = await call('/api/telegram/link/status', { method: 'GET', headers: { origin: 'https://evil.example', ...bearer } })
  check('чужой origin на API отклоняется до обработки', evil.status === 403, `status=${evil.status}`)
  const pre = await call('/api/telegram/link/confirm', { method: 'OPTIONS', headers: { origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } })
  check('preflight разрешает POST и только для этого маршрута', pre.status === 204 && String(pre.headers.get('access-control-allow-methods')).includes('POST') && !String(pre.headers.get('access-control-allow-methods')).includes('DELETE'), String(pre.headers.get('access-control-allow-methods')))
  check('CORS: localhost без ALLOW_LOCAL_ORIGINS не разрешён', (await call('/api/telegram/link/status', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })).status === 403)
}

{
  // Порядок «сначала авторизация, потом лимит»: анонимный запрос не расходует лимит.
  rateCalls.length = 0
  rateAllowed = false
  const anon = await call('/api/telegram/link/confirm', { method: 'POST', headers: { origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'A4K9P72QX8' }) })
  check('без токена 401, даже когда лимит исчерпан', anon.status === 401, `status=${anon.status}`)
  check('анонимный запрос не трогает счётчик попыток', rateCalls.length === 0, JSON.stringify(rateCalls))
  const limited = await call('/api/telegram/link/confirm', { method: 'POST', headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'A4K9P72QX8' }) })
  check('исчерпанный лимит аккаунта → 429', limited.status === 429, `status=${limited.status}`)
  check('лимит считается по пользователю', rateCalls[0]?.p_key === `telegram-link:${USER_ID}` && rateCalls[0]?.p_limit === 10 && rateCalls[0]?.p_window_seconds === 600, JSON.stringify(rateCalls[0]))
  rateAllowed = true
}

{
  previewRow = { telegram_display: 'Anna (@anna)', expires_at: '2099-01-01T00:00:00Z' }
  const preview = await call('/api/telegram/link/preview', { method: 'POST', headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'a4k9p-72qx8' }) })
  const body = await preview.json()
  check('предпросмотр показывает аккаунт, с которого запрошен код', preview.status === 200 && body.telegramAccount === 'Anna (@anna)', JSON.stringify(body))
  previewRow = null
  const missing = await call('/api/telegram/link/preview', { method: 'POST', headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'A4K9P72QX8' }) })
  check('предпросмотр неизвестного кода → 400', missing.status === 400, `status=${missing.status}`)
  const badShape = await call('/api/telegram/link/preview', { method: 'POST', headers: { origin: ORIGIN, ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'U-U-U-U-U-U' }) })
  check('код с недопустимыми символами (U) отклоняется', badShape.status === 400, `status=${badShape.status}`)
}

console.log(failed === 0 ? '\nTelegram API smoke: все проверки пройдены.' : `\nTelegram API smoke: провалено проверок — ${failed}.`)
process.exit(failed === 0 ? 0 : 1)
