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

test('display helpers format USD and Russian dates', () => {
  assert.match(formatMoney(4820), /4[\s\u00a0]?820\s?\$/)
  assert.equal(formatDate('2026-09-30'), '30 сентября 2026 г.')
  assert.equal(formatDate(null), '—')
  assert.equal(formatMonth(new Date('2026-10-08T12:00:00Z')), 'октябрь')
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

test('edge copies of the shared bot modules match bot/', async () => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const path = await import('node:path')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { EDGE_SHARED_FILES } = await import('../scripts/sync-edge.mjs')
  const pairs = EDGE_SHARED_FILES.map((file) => [`bot/${file}`, `supabase/functions/telegram-api/${file}`])
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
  assert.match(linkMessage.body.text, /КОД ПРИВЯЗКИ/)
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
  assert.match(sent.at(-1).body.text, /НЕ ПОДКЛЮЧЕНО/)
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
  assert.match(sent.at(-1).body.text, /ОТКЛЮЧИТЬ АККАУНТ\?/)
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
  assert.match(fansText, /Всего аудитория — <b>3<\/b>/)
  assert.match(fansText, /Новых за месяц — <b>2<\/b>/)
  assert.match(fansText, /Ближний круг — <b>1<\/b>/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/messages' } })
  const inboxText = sent.at(-1).body.text
  assert.match(inboxText, /Непрочитанные сообщения — <b>3<\/b>/)
  assert.match(inboxText, /Черновики AI на одобрении — <b>2<\/b>/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/analytics' } })
  const revText = sent.at(-1).body.text
  assert.match(revText, /ВЫРУЧКА · ОКТЯБРЬ/)
  assert.match(revText, /20\s?\$/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/tasks' } })
  const tasksText = sent.at(-1).body.text
  assert.match(tasksText, /Approve PPV draft/)
  assert.match(tasksText, /срок сегодня/)

  await bot.handleUpdate({ message: { from: { id: 7 }, chat: { id: 777, type: 'private' }, text: '/ai' } })
  const aiText = sent.at(-1).body.text
  assert.match(aiText, /Запусков сегодня — <b>1<\/b>/)
  assert.match(aiText, /Диалоги<\/b> — черновики ответов для инбокса/)
  assert.match(aiText, /AI-провайдер — <b>не настроен<\/b>/, 'без ключа провайдер показан честно')
})

test('/help lists the full Mara OS command set', async () => {
  const { HELP_TEXT } = await import('../bot/core.mjs')
  for (const cmd of ['/menu', '/status', '/fans', '/messages', '/content', '/episodes', '/analytics', '/revenue', '/tasks', '/ai', '/automations', '/settings', '/link', '/unlink']) {
    assert.ok(HELP_TEXT.includes(cmd), cmd)
  }
  assert.ok(!/garage|кредит|ОСАГО|Granta/i.test(HELP_TEXT), 'без автомобильного наследия')
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
  assert.equal(JSON.parse(text).error, 'Внутренняя ошибка сервера.')
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

/* ------------------------------------------- Mara OS sections (round 2) --- */

test('uuid ↔ base64url helpers roundtrip and reject garbage', async () => {
  const { uuidToB64Uuid, b64UuidToUuid } = await import('../bot/format.mjs')
  const id = '3f2c1a9e-7b4d-4e5f-9a8b-0c1d2e3f4a5b'
  const enc = uuidToB64Uuid(id)
  assert.equal(enc.length, 22)
  assert.match(enc, /^[A-Za-z0-9_-]+$/)
  assert.equal(b64UuidToUuid(enc), id)
  assert.equal(b64UuidToUuid(uuidToB64Uuid('00000000-0000-0000-0000-000000000000')), '00000000-0000-0000-0000-000000000000')
  assert.equal(uuidToB64Uuid('not-a-uuid'), '')
  assert.equal(b64UuidToUuid('!!!'), '')
  assert.equal(b64UuidToUuid('too-short'), '')
})

test('truncateText collapses whitespace and keeps the limit', async () => {
  const { truncateText } = await import('../bot/format.mjs')
  assert.equal(truncateText('hello   world', 50), 'hello world')
  assert.equal(truncateText('x'.repeat(500), 10).length, 10)
  assert.equal(truncateText('', 10), '')
  assert.equal(truncateText(null), '')
})

/**
 * Харнесс «связанный чат»: telegram_links знает u-1, REST-записи подменены.
 * restRoutes: { 'table или rpc': (query, method, body) => rows | response }.
 */
async function maraBot({ restRoutes = {}, ai = {}, webAppUrl = SITE } = {}) {
  const { createBot } = await import('../bot/core.mjs')
  const sent = []
  const restCalls = []
  const bot = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    webAppUrl,
    ai,
    now: () => Date.parse('2026-10-09T12:00:00Z'),
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      const href = String(url)
      const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
      if (href.startsWith('https://api.telegram.org/')) {
        sent.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
        return json({ ok: true, result: { username: 'MaraOS_test_bot' } })
      }
      if (href.includes('/chat/completions')) {
        sent.push({ method: 'AI', body: init.body ? JSON.parse(init.body) : null })
        return json({
          model: 'test-model-1',
          usage: { total_tokens: 123 },
          choices: [{ message: { content: '1. Утро в студии — закулисье съёмки\n2. Q&A по персонажу — ответы фанам' } }],
        })
      }
      const table = /\/rest\/v1\/([^?]+)/.exec(href)?.[1] ?? ''
      const query = Object.fromEntries(new URL(href).searchParams)
      const method = init.method ?? 'GET'
      const body = init.body ? JSON.parse(init.body) : null
      restCalls.push({ table, query, method, body })
      if (table === 'rpc/link_telegram_account') return json(false)
      if (table === 'rpc/consume_rate_limit') return json(restRoutes.consume_rate_limit ?? true)
      if (table === 'telegram_links') return json([{ user_id: 'u-1' }])
      const handler = restRoutes[table]
      if (handler) {
        const result = await handler(query, method, body)
        return json(result ?? null)
      }
      return json([])
    },
  })
  return { bot, sent, restCalls }
}

const command = (bot, text) => bot.handleUpdate({ message: { from: { id: 7, first_name: 'Ann' }, chat: { id: 777, type: 'private' }, text } })
const callback = (bot, data) => bot.handleUpdate({
  callback_query: { id: `cb-${data}`, from: { id: 7, first_name: 'Ann' }, data, message: { message_id: 5, chat: { id: 777, type: 'private' } } },
})
const lastText = (sent) => sent.findLast((m) => m.body?.text)?.body?.text ?? ''

test('new Mara OS sections render from their own tables', async () => {
  const { bot, sent } = await maraBot({
    restRoutes: {
      episodes: () => [
        { number: 1, title: 'Arrival', status: 'published', start_date: '2026-09-01', end_date: null },
        { number: 2, title: 'The Notebook', status: 'in_production', start_date: null, end_date: null },
      ],
      revenue_events: () => [{ amount: 49.99, category: 'ppv', occurred_at: '2026-10-02T10:00:00Z' }],
      purchases: () => [{ amount: 49.99, status: 'paid', purchased_at: '2026-10-02T10:05:00Z' }],
      subscriptions: () => [{ status: 'active' }, { status: 'active' }],
      automations: () => [{ name: 'Welcome sequence', status: 'active', enabled: true, last_run_at: '2026-10-08T09:00:00Z' }],
      automation_runs: () => [{ status: 'error', started_at: '2026-10-08T09:00:00Z', finished_at: '2026-10-08T09:01:00Z' }],
      telegram_notification_settings: () => [],
    },
  })

  await command(bot, '/episodes')
  const ep = lastText(sent)
  assert.match(ep, /Всего — <b>2<\/b>/)
  assert.match(ep, /#2 The Notebook/)
  assert.match(ep, /В производстве/)

  await command(bot, '/revenue')
  const rev = lastText(sent)
  assert.match(rev, /ВЫРУЧКА · ОКТЯБРЬ/)
  assert.match(rev, /50\s?\$/)
  assert.match(rev, /Активные подписки — <b>2<\/b>/)
  assert.match(rev, /Источник: revenue_events, purchases, subscriptions/)

  await command(bot, '/automations')
  const auto = lastText(sent)
  assert.match(auto, /Welcome sequence/)
  assert.match(auto, /Ошибки за последние 1 запуск — <b>1<\/b>/)
  assert.match(auto, /Движок исполнения ещё не построен/)

  await command(bot, '/status')
  const status = lastText(sent)
  assert.match(status, /Бот — <b>онлайн · режим polling<\/b>/)
  assert.match(status, /Telegram API — <b>доступен · @MaraOS_test_bot<\/b>/)
  assert.match(status, /Supabase — <b>доступен/)
  assert.match(status, /Этот чат — <b>привязан/)
  assert.match(status, /AI-провайдер — <b>не настроен/)
  assert.match(status, /коннекторы не реализованы/)
})

test('/status degrades to red rows instead of throwing when Supabase is down', async () => {
  const { createBot } = await import('../bot/core.mjs')
  const sent = []
  const bot = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    now: () => Date.parse('2026-10-09T12:00:00Z'),
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      const href = String(url)
      if (href.startsWith('https://api.telegram.org/')) {
        sent.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
        return new Response(JSON.stringify({ ok: true, result: { username: 'x' } }), { headers: { 'Content-Type': 'application/json' } })
      }
      if (href.includes('/rest/v1/telegram_links')) return new Response('[{"user_id":"u-1"}]', { headers: { 'Content-Type': 'application/json' } })
      return new Response('boom', { status: 500 })
    },
  })
  await command(bot, '/status')
  const text = sent.findLast((m) => m.body?.text)?.body?.text ?? ''
  assert.match(text, /СТАТУС/)
  assert.match(text, /Supabase — <b>недоступен/, 'деградация показана красной строкой, экран не падает')
})

test('settings: digest is off by default; toggles persist per owner', async () => {
  let storedRow = null
  const { bot, sent, restCalls } = await maraBot({
    restRoutes: {
      telegram_notification_settings: (query, method, body) => {
        if (method === 'POST') { storedRow = { ...body }; return null }
        if (method === 'PATCH') { storedRow = { ...storedRow, ...body }; return null }
        return storedRow ? [storedRow] : []
      },
    },
  })

  await command(bot, '/settings')
  const screen = lastText(sent)
  assert.match(screen, /Дайджест — <b>выключен \(по умолчанию\)<\/b>/, 'по умолчанию выключено — opt-in')

  // Включаем мастер-переключатель: строки нет → создаётся через POST с enabled=true.
  await callback(bot, 'ntf:master')
  assert.ok(restCalls.some((c) => c.table === 'telegram_notification_settings' && c.method === 'POST' && c.body.enabled === true))
  assert.match(lastText(sent), /Дайджест — <b>включён \(по подписке\)<\/b>/)

  // Выключаем один раздел: PATCH по user_id.
  await callback(bot, 'ntf:notify_tasks')
  const patch = restCalls.find((c) => c.table === 'telegram_notification_settings' && c.method === 'PATCH')
  assert.equal(patch.body.notify_tasks, false)
  assert.equal(patch.query.user_id, 'eq.u-1')
  assert.match(lastText(sent), /◻️ 📋 Задачи/)

  // Незнакомый toggle ничего не пишет.
  const writes = restCalls.filter((c) => (c.method === 'PATCH' || c.method === 'POST') && c.table === 'telegram_notification_settings').length
  await callback(bot, 'ntf:hack_the_planet')
  const writesAfter = restCalls.filter((c) => (c.method === 'PATCH' || c.method === 'POST') && c.table === 'telegram_notification_settings').length
  assert.equal(writes, writesAfter)
})

test('AI commands are honest when the provider key is missing', async () => {
  const { bot, sent, restCalls } = await maraBot({ ai: {} })
  await command(bot, '/ideas')
  const text = lastText(sent)
  assert.match(text, /AI-ПРОВАЙДЕР НЕ НАСТРОЕН/)
  assert.match(text, /не будет выдумывать|выдуманного результата/, 'никаких выдуманных результатов')
  assert.ok(!sent.some((m) => m.method === 'AI'), 'внешних AI-вызовов не было')
  assert.ok(!restCalls.some((c) => c.table === 'ai_runs' && c.method === 'POST'), 'в журнал без вызова не пишем')

  await callback(bot, 'ai:sum:fans')
  assert.match(lastText(sent), /НЕ НАСТРОЕН/)
  assert.ok(!sent.some((m) => m.method === 'AI'))
})

test('AI ideas call the real provider and log the run to ai_runs', async () => {
  const { bot, sent, restCalls } = await maraBot({
    ai: { apiKey: 'sk-test', baseUrl: 'https://llm.test/v1', model: 'test-model-1' },
    restRoutes: {
      characters: () => [{ name: 'Mara', description: 'test persona' }],
      content: () => [{ title: 'Old drop' }],
    },
  })
  await command(bot, '/ideas')
  const text = lastText(sent)
  assert.match(text, /ИДЕИ КОНТЕНТА/)
  assert.match(text, /test-model-1/)
  const aiCall = sent.find((m) => m.method === 'AI')
  assert.ok(aiCall, 'вызов провайдера был')
  assert.match(aiCall.body.messages[1].content, /Mara/)
  assert.match(aiCall.body.messages[1].content, /Old drop/, 'промпт избегает повторов пайплайна')
  const run = restCalls.find((c) => c.table === 'ai_runs' && c.method === 'POST')
  assert.ok(run, 'запуск записан в журнал')
  assert.equal(run.body.agent, 'content')
  assert.equal(run.body.model, 'test-model-1')
  assert.equal(run.body.status, 'success')
  assert.equal(run.body.tokens, 123)
})

test('AI briefings narrate the real snapshot; the hourly budget applies', async () => {
  const { bot, sent } = await maraBot({
    ai: { apiKey: 'sk-test', baseUrl: 'https://llm.test/v1' },
    restRoutes: {
      fans: () => [
        { relationship_level: 'visitor', joined_at: '2026-10-01' },
        { relationship_level: 'subscriber', joined_at: '2026-09-02' },
      ],
      subscriptions: () => [{ status: 'active' }],
    },
  })
  await callback(bot, 'ai:sum:fans')
  const prompt = sent.findLast((m) => m.method === 'AI')?.body?.messages?.[1]?.content ?? ''
  assert.match(prompt, /"total_fans":\s*2/, 'модель получает реальные числа, а не просит их выдумать')
  assert.match(prompt, /"active_subscriptions":\s*1/)
  assert.match(lastText(sent), /Источник: живые таблицы/)
})

test('AI budget: 429-like state produces an honest limit screen', async () => {
  const { bot, sent } = await maraBot({
    ai: { apiKey: 'sk-test', baseUrl: 'https://llm.test/v1' },
    restRoutes: { consume_rate_limit: false },
  })
  await command(bot, '/ideas')
  assert.match(lastText(sent), /ЛИМИТ AI ИСЧЕРПАН/)
  assert.ok(!sent.some((m) => m.method === 'AI'))
})

test('draft review: approve mirrors console semantics; dismiss deletes; counters sync', async () => {
  const convId = '11111111-2222-3333-4444-555555555555'
  const draftId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  let awaiting = 2
  let draftAlive = true
  const writes = []
  const { bot, sent } = await maraBot({
    restRoutes: {
      messages: (query, method, body) => {
        writes.push({ method, body, query })
        if (method === 'GET') {
          return draftAlive
            ? [{ id: draftId, conversation_id: convId, content: 'Dragon wants an update 💜', status: 'awaiting_approval', ai_generated: true, created_at: '2026-10-09T10:00:00Z' }]
            : []
        }
        if (method === 'PATCH') { if (body?.status === 'approved') draftAlive = false; return null }
        if (method === 'DELETE') { draftAlive = false; return null }
        return null
      },
      conversations: (query, method, body) => {
        writes.push({ method, body, query })
        if (method === 'GET') {
          if (query.id === `eq.${convId}` && query.select === 'id,subject') return [{ id: convId, subject: 'Dragon' }]
          if (query.id === `eq.${convId}`) return [{ awaiting_approval_count: awaiting }]
          return [{ id: convId, subject: 'Dragon', unread_count: 0, awaiting_approval_count: awaiting, last_message_at: '2026-10-09T10:00:00Z' }]
        }
        if (method === 'PATCH') { awaiting = Math.max(0, awaiting - 1); return null }
        return null
      },
    },
  })

  const { uuidToB64Uuid } = await import('../bot/format.mjs')
  const key = `${uuidToB64Uuid(convId)}${uuidToB64Uuid(draftId)}`

  await callback(bot, 'drafts')
  const queue = lastText(sent)
  assert.match(queue, /В очереди — <b>1<\/b>/)
  assert.match(queue, /Dragon wants an update/)
  const buttons = sent.findLast((m) => m.body?.text)?.body?.reply_markup?.inline_keyboard?.flat() ?? []
  for (const button of buttons) {
    assert.ok(!button.callback_data || Buffer.byteLength(button.callback_data) <= 64, `callback_data≤64: ${button.callback_data}`)
  }

  await callback(bot, `dra${key}`)
  const afterApprove = lastText(sent)
  assert.match(afterApprove, /Черновик одобрен/)
  const msgPatch = writes.find((w) => w.method === 'PATCH' && w.body?.status === 'approved')
  assert.ok(msgPatch, 'статус сообщения = approved, без sent')
  assert.equal('sent_at' in (msgPatch.body ?? {}), false)
  const convPatch = writes.find((w) => w.method === 'PATCH' && typeof w.body?.awaiting_approval_count === 'number')
  assert.equal(convPatch.body.awaiting_approval_count, 1, 'счётчик уменьшен, как в веб-репозитории')

  // Повторное нажатие на устаревшую кнопку не падает и не пишет.
  writes.length = 0
  await callback(bot, `dra${key}`)
  assert.match(lastText(sent), /уже обработан/)
  assert.equal(writes.filter((w) => w.method !== 'GET').length, 0)

  // Новый черновик → dismiss: DELETE + декремент, без status=approved.
  draftAlive = true
  writes.length = 0
  await callback(bot, `drx${key}`)
  assert.ok(writes.some((w) => w.method === 'DELETE'))
  assert.ok(!writes.some((w) => w.body?.status === 'approved'))
  assert.match(lastText(sent), /Черновик отклонён/)
})

test('digest: opt-in only, builds from fresh events, advances watermark without duplicates', async () => {
  let settings = {
    user_id: 'u-1',
    enabled: true,
    notify_tasks: true,
    notify_inbox: true,
    notify_ai: false,
    notify_automations: false,
    notify_metrics: false,
    watermark: {},
    last_notified_at: null,
  }
  const { bot, restCalls } = await maraBot({
    restRoutes: {
      telegram_notification_settings: (query, method, body) => {
        if (method === 'POST') { settings = { ...settings, ...body }; return null }
        if (method === 'PATCH') { settings = { ...settings, ...body }; return null }
        return [settings]
      },
      tasks: (query) => {
        // Эмуляция БД: после watermark свежих задач нет.
        if (String(query.created_at ?? '').startsWith('gt.')) return []
        return [{ title: 'Approve the PPV draft', created_at: '2026-10-09T08:00:00Z' }]
      },
      conversations: (query) => (String(query.last_message_at ?? '').startsWith('gt.')
        ? []
        : [{ unread_count: 3, awaiting_approval_count: 1, last_message_at: '2026-10-09T09:00:00Z' }]),
    },
  })

  const digest = await bot.buildDigest(777)
  assert.equal(digest.skipped, null)
  assert.match(digest.text, /новая задача|новые задачи|новых задач/)
  assert.match(digest.text, /3<\/b> непрочитанных · <b>1<\/b> черновик ждёт/)
  assert.ok(!/AI:/.test(digest.text), 'выключенные разделы молчат')
  assert.ok(digest.watermark.tasks, 'watermark предложен')

  // Watermark сохраняется ПОСЛЕ отправки (это делает notify-скрипт).
  await bot.writeNotificationSettings(digest.userId, { watermark: digest.watermark, last_notified_at: '2026-10-09T12:00:00Z' })
  const again = await bot.buildDigest(777)
  assert.equal(again.skipped, 'quiet', 'те же события не уходят повторно')

  // Дайджест выключен → skipped=disabled, чтения событий не требуется.
  settings = { ...settings, enabled: false }
  const off = await bot.buildDigest(777)
  assert.equal(off.skipped, 'disabled')
  const taskReads = restCalls.filter((c) => c.table === 'tasks').length
  assert.ok(taskReads <= 2, 'при выключенном дайджесте события не читаются')
})

test('settings without migration 0005 tells what to apply instead of crashing', async () => {
  const { bot, sent } = await maraBot({
    restRoutes: {
      telegram_notification_settings: () => { throw new Error('table missing') },
    },
  })
  // Харнесс не умеет 404: используем прямой fetch-мок, где таблицы нет (404 PostgREST).
  const { createBot } = await import('../bot/core.mjs')
  const sent2 = []
  const bot2 = createBot({
    telegramToken: '8703956173:TEST-TOKEN-0123456789abcdefghij',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon',
    supabaseServiceRoleKey: 'service',
    now: () => Date.parse('2026-10-09T12:00:00Z'),
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      const href = String(url)
      if (href.startsWith('https://api.telegram.org/')) {
        sent2.push({ method: href.split('/').pop(), body: init.body ? JSON.parse(init.body) : null })
        return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } })
      }
      if (href.includes('/rest/v1/telegram_links')) return new Response('[{"user_id":"u-1"}]', { headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ code: '42P01', message: 'relation does not exist' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    },
  })
  await command(bot2, '/settings')
  const screen = sent2.findLast((m) => m.body?.text)?.body?.text ?? ''
  assert.match(screen, /миграция базы <b>0005<\/b>/)
  assert.doesNotMatch(screen, /temporarily unavailable/)

  const digest = await bot2.buildDigest(777)
  assert.equal(digest.skipped, 'no-table')
  void bot
  void sent
})

test('main keyboard covers all Mara OS sections', async () => {
  const { bot, sent } = await maraBot({})
  await command(bot, '/menu')
  const buttons = sent.findLast((m) => m.body?.reply_markup)?.body?.reply_markup?.inline_keyboard?.flat() ?? []
  for (const key of ['fans', 'messages', 'content', 'episodes', 'analytics', 'revenue', 'tasks', 'ai', 'automations', 'status', 'settings']) {
    assert.ok(buttons.some((b) => b.callback_data === key), key)
  }
})
