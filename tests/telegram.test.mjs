import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LINK_CODE_ALPHABET,
  LINK_CODE_PATTERN,
  createLinkCode,
  daysUntil,
  escapeHtml,
  formatDate,
  formatLinkCode,
  formatMoney,
  formatMonth,
  hashLinkCode,
  inCurrentMonth,
  normalizeLinkCode,
  plural,
  safeEqual,
  telegramDisplayName,
} from '../bot/format.mjs'
import { MINI_APP_SCREENS } from '../bot/format.mjs'
import { ApiError } from '../bot/core.mjs'
import { buildAllowedOrigins, createTelegramApi, createWebhookHealth, enforceLinkAttemptLimit, routeOf } from '../bot/api.mjs'
import { findEdgeDrift } from '../scripts/sync-edge.mjs'

const SITE = 'https://andrey1904-dev.github.io/MoraOS-v2/'

test('link codes: Crockford base32 alphabet, 10 symbols (50 bits), soft normalization', () => {
  assert.equal(LINK_CODE_ALPHABET.length, 32)
  assert.equal(new Set(LINK_CODE_ALPHABET).size, 32)
  assert.ok(!/[ILOU]/.test(LINK_CODE_ALPHABET), 'I, L, O, U исключены из алфавита')

  // Детерминированный «генератор»: байты 0..9 → первые 10 символов алфавита.
  const code = createLinkCode((size) => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].slice(0, size)))
  assert.equal(code, '0123456789')
  assert.match(code, LINK_CODE_PATTERN)

  // Старшие биты байта не влияют на символ: 256 делится на 32, выбор равномерный.
  assert.equal(createLinkCode((size) => Uint8Array.from(new Array(size).fill(0xff))), 'ZZZZZZZZZZ')

  // Мягкая нормализация: регистр, пробелы и дефисы не важны; O→0, I/L→1.
  assert.equal(normalizeLinkCode(' 0123-4567 89 '), '0123456789')
  assert.equal(normalizeLinkCode('o1il'), '0111')
  assert.equal(hashLinkCode(code), hashLinkCode(code.toLowerCase()))
  assert.notEqual(hashLinkCode(code), hashLinkCode('0123456780'))
  assert.match(hashLinkCode(code), /^[0-9a-f]{64}$/)

  // Недопустимые символы не «исправляются» молча: проверка формата их отвергает.
  assert.equal(LINK_CODE_PATTERN.test(normalizeLinkCode('0123456U89')), false)
  assert.equal(LINK_CODE_PATTERN.test(normalizeLinkCode('012345678')), false)
  assert.equal(formatLinkCode('ABCDEFGHJK'), 'ABCDE-FGHJK')
})

test('safeEqual compares secrets without length leaks and rejects empty input', () => {
  assert.equal(safeEqual('webhook-secret', 'webhook-secret'), true)
  assert.equal(safeEqual('webhook-secret', 'webhook-secreT'), false)
  assert.equal(safeEqual('short', 'a-much-longer-value'), false)
  assert.equal(safeEqual('', 'secret'), false)
})

test('telegramDisplayName is safe to show before linking', () => {
  assert.equal(telegramDisplayName({ first_name: 'Anna', last_name: 'K', username: 'anna' }), 'Anna K @anna')
  assert.equal(telegramDisplayName({ first_name: 'Bob\u0007\n' }), 'Bob')
  assert.equal(telegramDisplayName({}), '')
  assert.ok(telegramDisplayName({ first_name: 'x'.repeat(500) }).length <= 80)
})

test('HTML escaping protects bot messages from user-provided text', () => {
  assert.equal(escapeHtml(`<script title="a&b">'x'</script>`), '&lt;script title=&quot;a&amp;b&quot;&gt;&#39;x&#39;&lt;/script&gt;')
})

test('display helpers format USD and English dates', () => {
  assert.match(formatMoney(4820), /\$4,?820/)
  assert.equal(formatDate('2026-09-30'), 'September 30, 2026')
  assert.equal(formatDate(null), '—')
  assert.equal(formatMonth(new Date('2026-10-08T12:00:00Z')), 'October')
})

test('daysUntil and inCurrentMonth handle boundaries', () => {
  assert.equal(daysUntil('2026-10-02', new Date('2026-09-30T12:00:00Z')), 2)
  assert.equal(daysUntil('2026-09-29', new Date('2026-09-30T12:00:00Z')), -1)
  assert.equal(daysUntil(null), null)
  const now = new Date('2026-09-30T12:00:00Z')
  const rows = [
    { amount: 100, occurred_at: '2026-09-01T10:00:00Z' },
    { amount: 200, occurred_at: '2026-09-30T11:59:00Z' },
    { amount: 400, occurred_at: '2026-08-31T23:59:00Z' },
    { amount: 800, occurred_at: '2026-10-01T00:00:00Z' },
  ]
  assert.deepEqual(inCurrentMonth(rows, 'occurred_at', now), rows.slice(0, 2))
})

test('English plural helper', () => {
  assert.equal(plural(1, 'day'), 'day')
  assert.equal(plural(2, 'day'), 'days')
  assert.equal(plural(0, 'event'), 'events')
})

test('edge copies of the bot core match bot/core.mjs and bot/format.mjs', async () => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const path = await import('node:path')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const pairs = [
    ['bot/core.mjs', 'supabase/functions/telegram-api/core.mjs'],
    ['bot/format.mjs', 'supabase/functions/telegram-api/format.mjs'],
    ['bot/api.mjs', 'supabase/functions/telegram-api/api.mjs'],
  ]
  for (const [source, copy] of pairs) {
    const [a, b] = await Promise.all([
      readFile(path.join(root, source), 'utf8'),
      readFile(path.join(root, copy), 'utf8'),
    ])
    assert.equal(b, a, `${copy} must be a copy of ${source} (re-sync it)`)
  }
  assert.deepEqual(findEdgeDrift(), [], 'npm run sync:edge')
})

test('createLinkCode uses Web Crypto and matches the link code pattern', () => {
  for (let i = 0; i < 20; i += 1) assert.match(createLinkCode(), LINK_CODE_PATTERN)
})

test('bot core answers commands and issues link codes', async () => {
  const { createBot } = await import('../bot/core.mjs')
  const sent = []
  const rest = []
  const insertedCodes = []
  const bot = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    webAppUrl: SITE,
    now: () => Date.parse('2026-09-30T12:00:00Z'),
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      const href = String(url)
      if (href.startsWith('https://api.telegram.org/')) {
        sent.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
        return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } })
      }
      rest.push(href)
      if (href.includes('/rest/v1/telegram_links')) return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
      if (href.includes('/rest/v1/telegram_link_codes') && init.method === 'POST') {
        insertedCodes.push(JSON.parse(init.body))
        return new Response(null, { status: 201 })
      }
      return new Response('null', { headers: { 'Content-Type': 'application/json' } })
    },
  })

  await bot.handleUpdate({
    message: { from: { id: 7, first_name: 'Ann' }, chat: { id: 777, type: 'private' }, text: '/link' },
  })
  const linkMessage = sent.at(-1)
  assert.equal(linkMessage.method, 'sendMessage')
  assert.match(linkMessage.body.text, /CONNECTION CODE/)
  assert.match(linkMessage.body.text, /[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}/)
  assert.ok(rest.some((href) => href.includes('/rest/v1/telegram_link_codes')))
  assert.equal(insertedCodes.at(-1)?.telegram_display, 'Ann', 'код хранит имя аккаунта для предпросмотра')

  // /help lists the Mara OS command set (no car-domain leftovers).
  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/help' } })
  const helpText = sent.at(-1).body.text
  for (const cmd of ['/fans', '/messages', '/content', '/analytics', '/tasks', '/ai']) {
    assert.ok(helpText.includes(cmd), cmd)
  }
  assert.ok(!/garage|кредит|ОСАГО/i.test(helpText))

  // Non-private chats are ignored.
  const before = sent.length
  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: -100, type: 'group' }, text: '/link' } })
  assert.equal(sent.length, before)

  // Inline buttons behave as a live screen: callback confirmed, message edited.
  await bot.handleUpdate({
    callback_query: {
      id: 'cb-42',
      from: { id: 7, first_name: 'Ann' },
      data: 'fans',
      message: { message_id: 99, chat: { id: 777, type: 'private' } },
    },
  })
  assert.equal(sent.at(-3).method, 'answerCallbackQuery')
  assert.equal(sent.at(-2).method, 'sendChatAction')
  assert.equal(sent.at(-1).method, 'editMessageText')
  assert.equal(sent.at(-1).body.message_id, 99)
  assert.match(sent.at(-1).body.text, /NOT CONNECTED/)
  const keyboards = sent.at(-1).body.reply_markup.inline_keyboard.flat()
  assert.ok(keyboards.some((button) => button.callback_data === 'link'))

  // Destructive action needs a second-tap confirmation.
  await bot.handleUpdate({
    callback_query: {
      id: 'cb-43',
      from: { id: 7 },
      data: 'unlink',
      message: { message_id: 100, chat: { id: 777, type: 'private' } },
    },
  })
  assert.equal(sent.at(-1).method, 'editMessageText')
  assert.match(sent.at(-1).body.text, /DISCONNECT ACCOUNT\?/)
  const confirmButtons = sent.at(-1).body.reply_markup.inline_keyboard.flat()
  assert.ok(confirmButtons.some((button) => button.callback_data === 'unlink_confirm'))
})

test('linked chat sees Mara OS summaries from CRM tables', async () => {
  const { createBot } = await import('../bot/core.mjs')
  const sent = []
  const bot = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    webAppUrl: SITE,
    now: () => Date.parse('2026-10-08T12:00:00Z'),
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      const href = String(url)
      if (href.startsWith('https://api.telegram.org/')) {
        sent.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
        return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } })
      }
      const body = (rows) => new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } })
      if (href.includes('/rest/v1/telegram_links')) return body([{ user_id: 'u-1' }])
      if (href.includes('/rest/v1/fans')) {
        return body([
          { relationship_level: 'visitor', joined_at: '2026-10-01' },
          { relationship_level: 'subscriber', joined_at: '2026-09-12' },
          { relationship_level: 'inner_circle', joined_at: '2026-10-05' },
        ])
      }
      if (href.includes('/rest/v1/subscriptions')) return body([{ status: 'active' }])
      if (href.includes('/rest/v1/conversations')) {
        return body([{ unread_count: 3, awaiting_approval_count: 2, last_message_at: '2026-10-08' }])
      }
      if (href.includes('/rest/v1/revenue_events')) {
        return body([{ amount: 19.99, category: 'subscription', occurred_at: '2026-10-02' }])
      }
      if (href.includes('/rest/v1/tasks')) return body([{ title: 'Approve PPV draft', priority: 'urgent', due_date: '2026-10-08', status: 'todo' }])
      if (href.includes('/rest/v1/content')) return body([])
      if (href.includes('/rest/v1/ai_runs')) return body([{ agent: 'conversation', status: 'success', created_at: '2026-10-08T08:00:00Z' }])
      throw new Error(`unexpected fetch: ${href}`)
    },
  })

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/fans' } })
  const fansText = sent.at(-1).body.text
  assert.match(fansText, /Total audience — <b>3<\/b>/)
  assert.match(fansText, /New this month — <b>2<\/b>/)
  assert.match(fansText, /Inner circle — <b>1<\/b>/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/messages' } })
  const inboxText = sent.at(-1).body.text
  assert.match(inboxText, /Unread messages — <b>3<\/b>/)
  assert.match(inboxText, /awaiting approval — <b>2<\/b>/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/analytics' } })
  const revText = sent.at(-1).body.text
  assert.match(revText, /REVENUE · OCTOBER/)
  assert.match(revText, /\$20/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/tasks' } })
  const tasksText = sent.at(-1).body.text
  assert.match(tasksText, /Approve PPV draft/)
  assert.match(tasksText, /due today/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/ai' } })
  const aiText = sent.at(-1).body.text
  assert.match(aiText, /Runs today — <b>1<\/b>/)
  assert.match(aiText, /conversation — <b>1<\/b>/)
})

test('text progress bar is stable at boundaries', async () => {
  const { progressBar } = await import('../bot/core.mjs')
  assert.equal(progressBar(0, 8), '░░░░░░░░')
  assert.equal(progressBar(1, 8), '████████')
  assert.equal(progressBar(0.5, 8), '████░░░░')
  assert.equal(progressBar(2, 8), '████████')
  assert.equal(progressBar(-1, 8), '░░░░░░░░')
  assert.equal(progressBar(Number.NaN, 8), '░░░░░░░░')
})

test('healthReport is not healthy without fresh updates', async () => {
  const { createBot } = await import('../bot/core.mjs')
  const bot = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    fetchImpl: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    now: () => 1_000_000,
    logger: { warn() {}, error() {} },
  })
  assert.equal(bot.healthReport({ mode: 'polling', pollingStatus: 'starting' }).ok, false)
  assert.equal(bot.healthReport({ mode: 'polling', pollingStatus: 'online', lastSuccessfulAt: 999_000 }).ok, true)
  assert.equal(bot.healthReport({ mode: 'polling', pollingStatus: 'online', lastSuccessfulAt: 1 }).ok, false)
  assert.equal(bot.healthReport({ mode: 'webhook', pollingStatus: 'online' }).ok, true)
  assert.equal(bot.healthReport({ mode: 'webhook', pollingStatus: 'online' }).service, 'mara-telegram-api')
})

/* ------------------------------------------------------- Telegram Mini App --- */

function recordingBot(webAppUrl, { linked = false } = {}) {
  return import('../bot/core.mjs').then(({ createBot }) => {
    const sent = []
    const warnings = []
    const bot = createBot({
      telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon',
      supabaseServiceRoleKey: 'service',
      webAppUrl,
      now: () => Date.parse('2026-09-30T12:00:00Z'),
      logger: { warn: (...args) => warnings.push(args.join(' ')), error() {} },
      fetchImpl: async (url, init = {}) => {
        const href = String(url)
        if (href.startsWith('https://api.telegram.org/')) {
          sent.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
          return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } })
        }
        if (href.includes('/rest/v1/telegram_links')) {
          return new Response(linked ? '[{"user_id":"u"}]' : '[]', { headers: { 'Content-Type': 'application/json' } })
        }
        if (href.includes('/rest/v1/telegram_link_codes')) return new Response(null, { status: 201 })
        return new Response('null', { headers: { 'Content-Type': 'application/json' } })
      },
    })
    return { bot, sent, warnings }
  })
}

const allButtons = (message) => (message?.body?.reply_markup?.inline_keyboard ?? []).flat()

test('normalizeMiniAppUrl accepts only public HTTPS and strips the hash', async () => {
  const { normalizeMiniAppUrl } = await import('../bot/format.mjs')
  assert.equal(normalizeMiniAppUrl(SITE), SITE)
  assert.equal(normalizeMiniAppUrl(` ${SITE}#/fans `), SITE)
  for (const bad of [
    '', '   ', null, undefined, 'not a url', 'http://andrey1904-dev.github.io/MoraOS-v2/',
    'https://localhost:5173/', 'https://127.0.0.1/', 'https://user:pass@example.com/', 'javascript:alert(1)',
    'tg://resolve?domain=x',
  ]) {
    assert.equal(normalizeMiniAppUrl(bad), '', String(bad))
  }
})

test('miniAppUrl appends only whitelisted screens', async () => {
  const { miniAppUrl } = await import('../bot/format.mjs')
  assert.equal(miniAppUrl(SITE), SITE)
  assert.equal(miniAppUrl(SITE, 'telegram'), `${SITE}?screen=telegram`)
  assert.equal(miniAppUrl(SITE, 'fans'), `${SITE}?screen=fans`)
  assert.equal(miniAppUrl(SITE, '../admin'), SITE)
  assert.equal(miniAppUrl('http://insecure.example/', 'fans'), '')
})

test('bot screen keys are covered by the site route whitelist', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/lib/telegram-mini-app.ts', import.meta.url), 'utf8')
  const block = /START_ROUTES[^{]*\{([\s\S]*?)\}\)/.exec(source)?.[1] ?? ''
  const siteKeys = [...block.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1])
  for (const key of MINI_APP_SCREENS) assert.ok(siteKeys.includes(key), `key ${key} exists in START_ROUTES`)
})

test('miniAppMenuButton: web_app with configured URL, otherwise commands', async () => {
  const { miniAppMenuButton } = await import('../bot/format.mjs')
  assert.deepEqual(miniAppMenuButton(SITE), { type: 'web_app', text: 'Mara OS', web_app: { url: SITE } })
  assert.deepEqual(miniAppMenuButton(''), { type: 'commands' })
  assert.deepEqual(miniAppMenuButton('http://example.com/'), { type: 'commands' })
})

test('main menu opens the console via web_app button (not url)', async () => {
  const { bot, sent } = await recordingBot(SITE)
  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/menu' } })
  const buttons = allButtons(sent.findLast((m) => m.method === 'sendMessage' || m.method === 'sendPhoto'))
  const open = buttons.find((b) => b.web_app)
  assert.ok(open, 'web_app button present')
  assert.equal(open.web_app.url, SITE)
  assert.equal(open.url, undefined)
  assert.ok(!buttons.some((b) => typeof b.url === 'string'), 'no plain url console buttons')
  for (const key of ['fans', 'messages', 'content', 'analytics', 'tasks', 'ai']) {
    assert.ok(buttons.some((b) => b.callback_data === key), key)
  }
})

test('link-code message points at the Telegram section via ?screen=telegram', async () => {
  const { bot, sent } = await recordingBot(`${SITE}#/settings`)
  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/link' } })
  const [button] = allButtons(sent.at(-1))
  assert.equal(button.web_app.url, `${SITE}?screen=telegram`)
})

test('without WEB_APP_URL — or with a bad one — the console button is hidden', async () => {
  for (const url of ['', 'http://andrey1904-dev.github.io/MoraOS-v2/', 'junk']) {
    const { bot, sent } = await recordingBot(url)
    await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/menu' } })
    const buttons = allButtons(sent.findLast((m) => m.method === 'sendMessage' || m.method === 'sendPhoto'))
    assert.ok(!buttons.some((b) => b.web_app || b.url), `no console button for "${url}"`)
    assert.ok(buttons.some((b) => b.callback_data === 'fans'))
  }
})

test('applyBotProfile sets the web_app menu button and stores commands', async () => {
  const { BOT_COMMANDS } = await import('../bot/core.mjs')
  const { bot, sent } = await recordingBot(SITE)
  await bot.applyBotProfile()
  const menu = sent.find((m) => m.method === 'setChatMenuButton')
  assert.deepEqual(menu.body.menu_button, { type: 'web_app', text: 'Mara OS', web_app: { url: SITE } })
  const commands = sent.find((m) => m.method === 'setMyCommands')
  assert.deepEqual(commands.body.commands, BOT_COMMANDS)
  const description = sent.find((m) => m.method === 'setMyDescription')
  assert.match(description.body.description, /Mara OS/i)
})

test('applyBotProfile falls back to commands with a warning on bad URL', async () => {
  const { bot, sent, warnings } = await recordingBot('http://insecure.example/')
  await bot.applyBotProfile()
  assert.deepEqual(sent.find((m) => m.method === 'setChatMenuButton').body.menu_button, { type: 'commands' })
  assert.ok(warnings.some((w) => /WEB_APP_URL/.test(w)))
})

/* ------------------------------------------------ HTTP-слой API (api.mjs) --- */

const ORIGIN = 'https://andrey1904-dev.github.io'
const API_BASE = 'https://project.supabase.co/functions/v1/telegram-api'
const USER = '22222222-2222-4222-8222-222222222222'

function fakeBot(overrides = {}) {
  const calls = { rate: [], link: [], unlink: 0, preview: [] }
  const bot = {
    calls,
    async verifySiteSession(token) {
      if (token !== 'good-token') throw new ApiError(401, 'Web session expired. Sign in again.')
      return { id: USER }
    },
    async linkStatus() {
      return { linked: false }
    },
    async unlink() {
      calls.unlink += 1
      return { linked: false }
    },
    async consumeRateLimit(key, limit, windowSeconds) {
      calls.rate.push({ key, limit, windowSeconds })
      return true
    },
    async previewLinkForUser(code) {
      calls.preview.push(code)
      return { telegramAccount: 'Anna (@anna)', expiresAt: '2099-01-01T00:00:00Z' }
    },
    async confirmLinkForUser(userId, code) {
      calls.link.push({ userId, code })
      return { linked: true }
    },
    async handleUpdate() {},
    async sendMessage() {},
    async telegramCall() {
      return { url: '' }
    },
    ...overrides,
  }
  return bot
}

function makeApi(bot, extra = {}) {
  return createTelegramApi({
    bot,
    allowedOrigins: buildAllowedOrigins({ webAppUrl: `${ORIGIN}/MoraOS-v2/` }),
    health: async () => ({ status: 200, body: { ok: true, service: 'mara-telegram-api' } }),
    webhook: { enabled: true, secret: 'webhook-secret' },
    basePaths: ['/functions/v1/telegram-api'],
    logger: { warn() {}, error() {} },
    ...extra,
  })
}

const req = (path, init = {}) => new Request(`${API_BASE}${path}`, init)
const authed = { authorization: 'Bearer good-token', origin: ORIGIN, 'content-type': 'application/json' }

test('API routes: wrong method → 405 with Allow, unknown path → 404, foreign origin → 403', async () => {
  const api = makeApi(fakeBot())
  const wrong = await api(req('/api/telegram/link', { method: 'GET', headers: authed }))
  assert.equal(wrong.status, 405)
  assert.equal(wrong.headers.get('allow'), 'DELETE')
  assert.equal((await api(req('/api/telegram/link/confirm', { method: 'GET', headers: authed }))).status, 405)
  assert.equal((await api(req('/health', { method: 'POST' }))).status, 405)
  assert.equal((await api(req('/nope', { method: 'GET' }))).status, 404)
  const foreign = await api(req('/api/telegram/link/status', { headers: { ...authed, origin: 'https://evil.example' } }))
  assert.equal(foreign.status, 403)
})

test('API: CORS preflight lists only the methods of the route; localhost only when allowed', async () => {
  const api = makeApi(fakeBot())
  const pre = await api(req('/api/telegram/link', { method: 'OPTIONS', headers: { origin: ORIGIN } }))
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-methods'), 'DELETE, OPTIONS')
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN)
  const local = await api(req('/health', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }))
  assert.equal(local.status, 403, 'localhost без ALLOW_LOCAL_ORIGINS запрещён')
  assert.ok(buildAllowedOrigins({ allowLocal: true }).has('http://localhost:5173'))
  assert.ok(!buildAllowedOrigins({ allowLocal: false }).has('http://localhost:5173'))
  assert.equal(routeOf('/functions/v1/telegram-api/health', ['/functions/v1/telegram-api']), '/health')
})

test('API: authentication runs before the attempt limit, and the limit is per account', async () => {
  const bot = fakeBot({ async consumeRateLimit() { return false } })
  const api = makeApi(bot)
  const anon = await api(req('/api/telegram/link/confirm', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{"code":"0123456789"}' }))
  assert.equal(anon.status, 401, 'без токена — 401, а не 429')
  const limited = await api(req('/api/telegram/link/confirm', { method: 'POST', headers: authed, body: '{"code":"0123456789"}' }))
  assert.equal(limited.status, 429)
})

test('API: link attempts share one per-account bucket (10 per 10 minutes)', async () => {
  const bot = fakeBot()
  await enforceLinkAttemptLimit(bot, USER)
  assert.deepEqual(bot.calls.rate, [{ key: `telegram-link:${USER}`, limit: 10, windowSeconds: 600 }])
})

test('API: preview shows the account and does not link; confirm links', async () => {
  const bot = fakeBot()
  const api = makeApi(bot)
  const preview = await api(req('/api/telegram/link/preview', { method: 'POST', headers: authed, body: '{"code":"0123456789"}' }))
  assert.equal(preview.status, 200)
  assert.equal((await preview.json()).telegramAccount, 'Anna (@anna)')
  assert.equal(bot.calls.link.length, 0, 'предпросмотр не привязывает аккаунт')
  const confirm = await api(req('/api/telegram/link/confirm', { method: 'POST', headers: authed, body: '{"code":"0123456789"}' }))
  assert.equal(confirm.status, 200)
  assert.deepEqual(bot.calls.link, [{ userId: USER, code: '0123456789' }])
})

test('API: JSON body limits and content type are enforced', async () => {
  const api = makeApi(fakeBot())
  const wrongType = await api(req('/api/telegram/link/confirm', { method: 'POST', headers: { ...authed, 'content-type': 'text/plain' }, body: '{}' }))
  assert.equal(wrongType.status, 415)
  const big = await api(req('/api/telegram/link/confirm', { method: 'POST', headers: authed, body: JSON.stringify({ code: 'x'.repeat(5000) }) }))
  assert.equal(big.status, 413)
})

test('API: unexpected errors return a generic message; internal details stay in the log', async () => {
  const logged = []
  const bot = fakeBot({ async linkStatus() { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 service-role-key-leak') } })
  const api = makeApi(bot, { logger: { warn() {}, error: (...args) => logged.push(args.join(' ')) } })
  const response = await api(req('/api/telegram/link/status', { headers: authed }))
  const text = await response.text()
  assert.equal(response.status, 500)
  assert.equal(text.includes('ECONNREFUSED'), false)
  assert.equal(text.includes('service-role'), false)
  assert.equal(JSON.parse(text).error, 'Internal server error.')
  assert.ok(logged.some((line) => line.includes('ECONNREFUSED')), 'детали остаются в журнале сервера')
})

test('API webhook: wrong or missing secret → 403; correct secret → 200 even if handling fails', async () => {
  const api = makeApi(fakeBot({ async handleUpdate() { throw new Error('boom') } }))
  const update = JSON.stringify({ message: { chat: { id: 1 }, text: '/help' } })
  const json = { 'content-type': 'application/json' }
  const bad = await api(req('/', { method: 'POST', headers: { ...json, 'x-telegram-bot-api-secret-token': 'nope' }, body: update }))
  assert.equal(bad.status, 403)
  const none = await api(req('/', { method: 'POST', headers: json, body: update }))
  assert.equal(none.status, 403)
  const good = await api(req('/', { method: 'POST', headers: { ...json, 'x-telegram-bot-api-secret-token': 'webhook-secret' }, body: update }))
  assert.equal(good.status, 200)
  const getWebhook = await api(req('/', { method: 'GET' }))
  assert.equal(getWebhook.status, 405, 'webhook принимает только POST')
})

test('API /health: no webhook URL or last error text is exposed', async () => {
  const bot = fakeBot({
    async telegramCall() {
      return {
        url: 'https://project.supabase.co/functions/v1/telegram-api?secret=leak',
        pending_update_count: 3,
        last_error_date: Math.floor(Date.now() / 1000),
        last_error_message: 'Wrong response from the webhook: 500 internal token 123:AAA',
      }
    },
  })
  const health = createWebhookHealth({ bot, configured: true, logger: { warn() {} } })
  const { status, body } = await health()
  const text = JSON.stringify(body)
  assert.equal(status, 503, 'недавняя ошибка доставки — деградация')
  assert.equal(text.includes('leak'), false)
  assert.equal(text.includes('Wrong response'), false)
  assert.equal(text.includes('123:AAA'), false)
  assert.equal(body.service, 'mara-telegram-api')
  assert.equal('webhook' in body, false)
})

test('API /health without a configured token reports the state only', async () => {
  const health = createWebhookHealth({ bot: fakeBot(), configured: false, logger: { warn() {} } })
  const { status, body } = await health()
  assert.equal(status, 503)
  assert.equal(body.configured, false)
})
