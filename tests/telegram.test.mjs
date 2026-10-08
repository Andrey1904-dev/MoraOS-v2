import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLinkCode,
  daysUntil,
  escapeHtml,
  formatDate,
  formatMoney,
  formatMonth,
  hashLinkCode,
  inCurrentMonth,
  normalizeLinkCode,
  plural,
} from '../bot/format.mjs'
import { MINI_APP_SCREENS } from '../bot/format.mjs'

const SITE = 'https://andrey1904-dev.github.io/MoraOS-v2/'

test('one-time Telegram codes are readable, normalized and hashed consistently', () => {
  const code = createLinkCode((size) => Buffer.from([0, 1, 2, 3, 4].slice(0, size)))
  assert.equal(code, '0001020304')
  assert.equal(normalizeLinkCode(code.toLowerCase()), '0001020304')
  assert.equal(hashLinkCode(code), hashLinkCode('0001020304'))
  assert.notEqual(hashLinkCode(code), hashLinkCode('0001020305'))
  assert.match(hashLinkCode(code), /^[0-9a-f]{64}$/)
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
  ]
  for (const [source, copy] of pairs) {
    const [a, b] = await Promise.all([
      readFile(path.join(root, source), 'utf8'),
      readFile(path.join(root, copy), 'utf8'),
    ])
    assert.equal(b, a, `${copy} must be a copy of ${source} (re-sync it)`)
  }
})

test('createLinkCode does not depend on Buffer and works on Web Crypto', async () => {
  const code = createLinkCode()
  assert.match(code, /^[0-9A-F]{10}$/)
})

test('bot core answers commands and issues link codes', async () => {
  const { createBot } = await import('../bot/core.mjs')
  const sent = []
  const rest = []
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
  assert.match(linkMessage.body.text, /[0-9A-F]{5}-[0-9A-F]{5}/)
  assert.ok(rest.some((href) => href.includes('/rest/v1/telegram_link_codes')))

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
