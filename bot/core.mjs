/**
 * Mara OS Assistant — Telegram bot core.
 *
 * The same logic serves two transports:
 *   1. `bot/server.mjs` — Node.js long-polling service (npm run bot:start);
 *   2. `supabase/functions/telegram-api/` — Supabase Edge Function (webhook).
 *
 * Nothing platform-specific lives here: only `fetch` plus pure helpers from
 * `format.mjs`. The file is copied to the Edge Function directory — the copy
 * stays in sync, enforced by `tests/telegram.test.mjs`.
 *
 * The bot is a read-mostly companion of the web console: fan stats, inbox
 * triage, content pipeline, revenue, tasks and AI runs. Anything that sends
 * messages to fans or changes money stays behind human approval in the
 * web app — the bot only ever *suggests*.
 */
import {
  LINK_CODE_PATTERN,
  SERVICE_NAME,
  b64UuidToUuid,
  createLinkCode,
  daysUntil,
  escapeHtml,
  formatDate,
  formatLinkCode,
  formatMoney,
  formatMonth,
  hashLinkCode,
  inCurrentMonth,
  miniAppMenuButton,
  miniAppUrl,
  normalizeLinkCode,
  plural,
  telegramDisplayName,
  truncateText,
  uuidToB64Uuid,
} from './format.mjs'
import {
  AiNotConfiguredError,
  BOT_SYSTEM_PROMPT,
  createAiClient,
  ideasPrompt,
  summaryPrompt,
} from './ai.mjs'

export { LINK_CODE_PATTERN }

/** How long a one-time link code lives. */
export const CODE_TTL_MS = 10 * 60 * 1000

/**
 * AI summary calls per linked account per hour (Postgres rate limiter).
 * AI generations cost real provider tokens, so the budget is explicit.
 */
export const AI_CALL_LIMIT = Object.freeze({ limit: 30, windowSeconds: 60 * 60 })

/**
 * AI agents available in Mara OS (same roster as the web AI Studio).
 * Display metadata only — execution lives in the console / pipeline.
 */
export const AI_AGENTS = Object.freeze([
  { id: 'character', label: 'Character', role: 'persona voice & boundaries' },
  { id: 'conversation', label: 'Conversation', role: 'reply drafts for the inbox' },
  { id: 'sales', label: 'Sales', role: 'offer timing & pricing hints' },
  { id: 'memory', label: 'Memory', role: 'fan fact extraction' },
  { id: 'content', label: 'Content', role: 'ideas, hooks and scripts' },
  { id: 'analytics', label: 'Analytics', role: 'metric briefings' },
])

/** Notification kinds the owner can toggle in /settings (opt-in, off by default). */
export const NOTIFICATION_KINDS = Object.freeze([
  ['notify_tasks', '📋 Tasks'],
  ['notify_inbox', '💬 Inbox decisions'],
  ['notify_ai', '🤖 AI run results'],
  ['notify_automations', '⚙️ Automation errors'],
  ['notify_metrics', '📈 Metric changes'],
])

export const RELATIONSHIP_LABELS = {
  visitor: 'Visitors',
  follower: 'Followers',
  subscriber: 'Subscribers',
  admirer: 'Admirers',
  supporter: 'Supporters',
  inner_circle: 'Inner circle',
}

const RULE = '━━━━━━━━━━━━━━━━'

export const HELP_TEXT = [
  '<b>🤖 MARA OS ASSISTANT — HELP</b>',
  RULE,
  '',
  '/menu — dashboard and sections',
  '/status — service health: Supabase, AI provider, bot, integrations',
  '/fans — audience by relationship level',
  '/messages — inbox: unread and drafts awaiting approval',
  '/content — pipeline: ready, scheduled, published',
  '/episodes — story episodes state',
  '/analytics — revenue this month by source (period + source shown)',
  '/revenue — revenue, purchases and subscriptions',
  '/tasks — open tasks by priority',
  '/ai — AI agents, runs, briefings and content ideas',
  '/automations — automation states and latest runs',
  '/settings — account link and notification options',
  '/link — connect this chat to your Mara OS account',
  '/unlink — disconnect (two-step confirmation)',
  '',
  '<i>The bot reads your account data and can approve/dismiss AI drafts —',
  'approval means exactly that; nothing is delivered to fans from here.</i>',
].join('\n')

export const BOT_DESCRIPTION =
  'Mara OS Assistant — the Telegram companion of the creator operating system. ' +
  'Audience stats, inbox triage, content pipeline, revenue and AI runs from your Mara OS account. ' +
  'A one-time /link code connects this chat to your console. Nothing is sent to fans from the bot.'
export const BOT_SHORT_DESCRIPTION = 'Mara OS: fans, inbox, content, revenue and AI — in your pocket.'

export const BOT_COMMANDS = [
  { command: 'start', description: 'Welcome screen and quick tour' },
  { command: 'menu', description: 'Dashboard and sections' },
  { command: 'status', description: 'Service health and integrations' },
  { command: 'fans', description: 'Audience by relationship level' },
  { command: 'messages', description: 'Inbox: unread and pending drafts' },
  { command: 'content', description: 'Content pipeline snapshot' },
  { command: 'episodes', description: 'Story episodes state' },
  { command: 'analytics', description: 'Revenue this month by source' },
  { command: 'revenue', description: 'Revenue, purchases, subscriptions' },
  { command: 'tasks', description: 'Open tasks' },
  { command: 'ai', description: 'AI agents, runs and briefings' },
  { command: 'automations', description: 'Automation states and runs' },
  { command: 'settings', description: 'Account link and notifications' },
  { command: 'link', description: 'Connect chat to your account' },
  { command: 'unlink', description: 'Disconnect account' },
  { command: 'help', description: 'Command list' },
]

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function makeSearch(values) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) params.append(key, String(value))
  }
  return params.toString()
}

export function readBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return ''
  const [scheme, token] = headerValue.split(' ')
  return scheme === 'Bearer' && token ? token.trim() : ''
}

export function unlinkedMessage() {
  return [
    '<b>🔌 NOT CONNECTED</b>',
    RULE,
    '',
    'This Telegram chat is not linked to a Mara OS account yet.',
    '',
    'Tap <b>Connect account</b> below or send /link — you will get a one-time',
    'code to enter in the web console.',
  ].join('\n')
}

function screenTitle(emoji, title) {
  return [`<b>${emoji} ${title.toUpperCase()}</b>`, RULE, '']
}
function statLine(icon, label, value) {
  return `${icon} ${label} — <b>${value}</b>`
}

export function progressBar(ratio, slots = 10) {
  const clamped = Math.min(1, Math.max(0, Number(ratio) || 0))
  const filled = Math.round(clamped * slots)
  return '█'.repeat(filled) + '░'.repeat(slots - filled)
}

export function createBot({
  telegramToken,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  webAppUrl = '',
  ai = {},
  transportMode = 'polling',
  telegramApiBase = 'https://api.telegram.org',
  fetchImpl = fetch,
  logger = console,
  now = () => Date.now(),
}) {
  if (!telegramToken) throw new Error('TELEGRAM_BOT_TOKEN is not set.')
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not set.')
  if (!supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY is not set.')
  if (!supabaseServiceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')

  const restBase = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`
  const authBase = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`

  /** Server-side AI provider (OpenAI-compatible). Missing key = honest "not configured". */
  const aiClient = createAiClient({
    apiKey: ai.apiKey ?? '',
    baseUrl: ai.baseUrl ?? '',
    model: ai.model ?? '',
    fetchImpl,
  })

  /** POST to the Telegram Bot API. */
  async function telegramCall(method, payload = {}, timeoutMs = 18_000) {
    let response
    try {
      response = await fetchImpl(`${telegramApiBase.replace(/\/+$/, '')}/bot${telegramToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new Error(`Telegram API connection failed: ${error instanceof Error ? error.message : 'network error'}`)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) {
      const description = typeof data?.description === 'string' ? data.description : `HTTP ${response.status}`
      throw new Error(`Telegram API ${method}: ${description}`)
    }
    return data.result
  }

  /** PostgREST request under the service-role key (server-side only). */
  async function supabaseRest(path, { method = 'GET', body, prefer } = {}) {
    let response
    try {
      response = await fetchImpl(`${restBase}/${path}`, {
        method,
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(prefer ? { Prefer: prefer } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      logger.error?.('[supabase] request failed:', error instanceof Error ? error.message : 'network error')
      throw new ApiError(502, 'Data service is temporarily unavailable. Please try again.')
    }

    const text = await response.text()
    if (!response.ok) {
      logger.error?.(`[supabase] REST returned ${response.status}`)
      throw new ApiError(502, 'Could not read your account data.')
    }
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  /** Verifies the web console access token through Supabase Auth. */
  async function verifySiteSession(accessToken) {
    if (!accessToken) {
      throw new ApiError(401, 'Sign in to your Mara OS account first, then try again.')
    }
    let response
    try {
      response = await fetchImpl(`${authBase}/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(12_000),
      })
    } catch {
      throw new ApiError(502, 'Could not verify the web session. Please try again.')
    }
    if (!response.ok) throw new ApiError(401, 'Web session expired. Sign in again.')
    const user = await response.json().catch(() => null)
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) {
      throw new ApiError(401, 'Could not confirm the web account.')
    }
    return user
  }

  /* ------------------------------------------------------------------ API --- */

  async function linkStatus(accessToken) {
    const user = await verifySiteSession(accessToken)
    const query = makeSearch({ select: 'linked_at', user_id: `eq.${user.id}`, limit: '1' })
    const rows = await supabaseRest(`telegram_links?${query}`)
    const linked = Array.isArray(rows) && rows.length > 0
    return {
      linked,
      ...(linked && rows[0].linked_at ? { linkedAt: rows[0].linked_at } : {}),
    }
  }

  /** Binds a Telegram code to an already verified web account. */
  async function confirmLinkForUser(userId, rawCode) {
    const code = normalizeLinkCode(rawCode)
    if (!LINK_CODE_PATTERN.test(code)) {
      throw new ApiError(400, 'Enter the full one-time code from Telegram.')
    }
    const result = await supabaseRest('rpc/link_telegram_account', {
      method: 'POST',
      body: { p_code_hash: hashLinkCode(code), p_user_id: userId },
    })
    if (result !== true) {
      throw new ApiError(400, 'Code is invalid or expired. Request a new one with /link.')
    }
    return { linked: true }
  }

  /**
   * Preview for the second step of linking: which Telegram account the code
   * belongs to. Reads only the display name stored with the code; the code
   * itself is not consumed here.
   */
  async function previewLinkForUser(rawCode) {
    const code = normalizeLinkCode(rawCode)
    if (!LINK_CODE_PATTERN.test(code)) {
      throw new ApiError(400, 'Enter the full one-time code from Telegram.')
    }
    const query = makeSearch({
      select: 'telegram_display,expires_at',
      code_hash: `eq.${hashLinkCode(code)}`,
      used_at: 'is.null',
      expires_at: `gt.${new Date(now()).toISOString()}`,
      limit: '1',
    })
    const rows = await supabaseRest(`telegram_link_codes?${query}`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) {
      throw new ApiError(400, 'Code is invalid or expired. Request a new one with /link.')
    }
    return {
      telegramAccount: String(row.telegram_display || 'Telegram account'),
      expiresAt: row.expires_at,
    }
  }

  /**
   * Fixed-window attempt counter shared by all API instances (Postgres function
   * consume_rate_limit, migration 0004). Fails closed: if the counter cannot be
   * read, the request is refused.
   */
  async function consumeRateLimit(key, limit, windowSeconds) {
    const allowed = await supabaseRest('rpc/consume_rate_limit', {
      method: 'POST',
      body: { p_key: key, p_limit: limit, p_window_seconds: windowSeconds },
    })
    if (typeof allowed !== 'boolean') {
      throw new ApiError(502, 'Could not check the request limit. Please try again.')
    }
    return allowed
  }

  async function unlink(accessToken) {
    const user = await verifySiteSession(accessToken)
    const query = makeSearch({ user_id: `eq.${user.id}` })
    await supabaseRest(`telegram_links?${query}`, { method: 'DELETE' })
    return { linked: false }
  }

  /* ------------------------------------------------------- Telegram flow --- */

  /** Mini App (web console) address; '' when WEB_APP_URL is unset or not HTTPS. */
  function siteCabinetUrl(screen = '') {
    return miniAppUrl(webAppUrl, screen)
  }

  /**
   * Button that launches the console as a Telegram Mini App (`web_app` type,
   * not `url`). The bot only works in private chats where it is supported.
   */
  function cabinetRow(screen = '', text = '📱 Open Mara OS') {
    const url = siteCabinetUrl(screen)
    return url ? [[{ text, web_app: { url } }]] : []
  }

  /** Keyboard for a chat that is not linked yet: code with one tap. */
  function connectKeyboard() {
    return { inline_keyboard: [[{ text: '🔗 Connect account', callback_data: 'link' }], ...cabinetRow()] }
  }

  /** Full section roster: [action key, button label, Mini App screen key]. */
  const SECTIONS = Object.freeze([
    ['fans', '👥 Fans', 'fans'],
    ['messages', '💬 Inbox', 'messages'],
    ['content', '🎬 Content', 'content'],
    ['episodes', '📺 Episodes', 'episodes'],
    ['analytics', '📊 Analytics', 'analytics'],
    ['revenue', '💰 Revenue', 'revenue'],
    ['tasks', '✅ Tasks', 'tasks'],
    ['ai', '🤖 AI', 'ai'],
    ['automations', '⚙️ Automations', 'automations'],
    ['status', '📡 Status', 'settings'],
    ['settings', '🔧 Settings', 'settings'],
  ])

  /** Main menu: all sections + web console. */
  function mainKeyboard(linked = true) {
    const rows = []
    if (!linked) rows.push([{ text: '🔗 Connect account', callback_data: 'link' }])
    const sections = SECTIONS.filter(([key]) => !(key === 'status' || key === 'settings'))
    for (let i = 0; i < sections.length; i += 3) {
      rows.push(sections.slice(i, i + 3).map(([key, label]) => ({ text: label, callback_data: key })))
    }
    rows.push([
      { text: '📡 Status', callback_data: 'status' },
      { text: '🔧 Settings', callback_data: 'settings' },
    ])
    rows.push(...cabinetRow())
    return { inline_keyboard: rows }
  }

  /**
   * Context keyboard of a section screen: neighbouring sections, refresh of
   * the current one and back-to-menu. Everything inside one message.
   */
  function sectionKeyboard(current, extraRows = []) {
    const neighbours = SECTIONS.filter(([key]) => key !== current && key !== 'status').slice(0, 6)
    const rows = [...extraRows]
    for (let i = 0; i < neighbours.length; i += 3) {
      rows.push(neighbours.slice(i, i + 3).map(([key, label]) => ({ text: label, callback_data: key })))
    }
    rows.push(
      [
        { text: '↻ Refresh', callback_data: current },
        { text: '🏠 Menu', callback_data: 'menu' },
      ],
      ...cabinetRow(SECTIONS.find(([key]) => key === current)?.[2] ?? ''),
    )
    return { inline_keyboard: rows }
  }

  async function sendMessage(chatId, text, extra = {}) {
    return telegramCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    })
  }

  /** "typing…" indicator while account data loads. Errors are ignored. */
  async function sendTyping(chatId) {
    try {
      await telegramCall('sendChatAction', { chat_id: chatId, action: 'typing' })
    } catch {
      // Non-critical: continue silently.
    }
  }

  /**
   * "Live screen": edits the message in place instead of spamming new ones.
   * If Telegram refuses (old message, photo caption) — sends a fresh one.
   * The "not modified" duplicate is swallowed silently.
   */
  async function updateScreen(chatId, messageId, text, markup) {
    try {
      await telegramCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: markup,
      })
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : ''
      if (/not modified/i.test(reason)) return true
      await sendMessage(chatId, text, { reply_markup: markup })
      return false
    }
  }

  async function getLinkedUserId(chatId) {
    const query = makeSearch({ select: 'user_id', telegram_chat_id: `eq.${chatId}`, limit: '1' })
    const rows = await supabaseRest(`telegram_links?${query}`)
    return Array.isArray(rows) && rows[0] ? rows[0].user_id : null
  }

  async function readUserRows(table, userId, select, extra = {}) {
    const query = makeSearch({ select, user_id: `eq.${userId}`, ...extra })
    return supabaseRest(`${table}?${query}`)
  }

  /* -------------------------------------------------- Mara OS data reads --- */

  async function ownerData(chatId, include = []) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return null
    const todayStart = new Date(now())
    todayStart.setUTCHours(0, 0, 0, 0)
    const tasks0 = include.map(async (key) => {
      if (key === 'fans') {
        const rows = await readUserRows('fans', userId, 'relationship_level,joined_at', { limit: '5000' })
        return ['fans', Array.isArray(rows) ? rows : []]
      }
      if (key === 'conversations') {
        const rows = await readUserRows(
          'conversations',
          userId,
          'unread_count,awaiting_approval_count,last_message_at',
          { order: 'last_message_at.desc', limit: '500' },
        )
        return ['conversations', Array.isArray(rows) ? rows : []]
      }
      if (key === 'content') {
        const rows = await readUserRows('content', userId, 'status,scheduled_at,published_at', {
          order: 'updated_at.desc',
          limit: '1000',
        })
        return ['content', Array.isArray(rows) ? rows : []]
      }
      if (key === 'revenue') {
        const rows = await readUserRows('revenue_events', userId, 'amount,category,occurred_at', {
          order: 'occurred_at.desc',
          limit: '2000',
        })
        return ['revenue', Array.isArray(rows) ? rows : []]
      }
      if (key === 'subscriptions') {
        const rows = await readUserRows('subscriptions', userId, 'status', { status: 'eq.active', limit: '5000' })
        return ['subscriptions', Array.isArray(rows) ? rows : []]
      }
      if (key === 'tasks') {
        const rows = await readUserRows('tasks', userId, 'title,priority,due_date,status', {
          status: 'in.(todo,in_progress,waiting)',
          order: 'due_date.asc',
          limit: '50',
        })
        return ['tasks', Array.isArray(rows) ? rows : []]
      }
      if (key === 'ai_runs') {
        const rows = await readUserRows('ai_runs', userId, 'agent,status,created_at', {
          created_at: `gte.${todayStart.toISOString()}`,
          order: 'created_at.desc',
          limit: '100',
        })
        return ['ai_runs', Array.isArray(rows) ? rows : []]
      }
      if (key === 'episodes') {
        const rows = await readUserRows('episodes', userId, 'number,title,status,start_date,end_date', {
          order: 'number.asc',
          limit: '200',
        })
        return ['episodes', Array.isArray(rows) ? rows : []]
      }
      if (key === 'purchases') {
        const rows = await readUserRows('purchases', userId, 'amount,status,purchased_at', {
          order: 'purchased_at.desc',
          limit: '1000',
        })
        return ['purchases', Array.isArray(rows) ? rows : []]
      }
      if (key === 'automations') {
        const rows = await readUserRows('automations', userId, 'name,status,enabled,last_run_at', {
          order: 'name.asc',
          limit: '100',
        })
        return ['automations', Array.isArray(rows) ? rows : []]
      }
      if (key === 'automation_runs') {
        const rows = await readUserRows('automation_runs', userId, 'status,started_at,finished_at', {
          order: 'started_at.desc',
          limit: '50',
        })
        return ['automation_runs', Array.isArray(rows) ? rows : []]
      }
      if (key === 'character') {
        const rows = await readUserRows('characters', userId, 'name,description,occupation,status', {
          order: 'created_at.asc',
          limit: '1',
        })
        return ['character', Array.isArray(rows) && rows[0] ? rows[0] : null]
      }
      if (key === 'content_titles') {
        const rows = await readUserRows('content', userId, 'title', {
          status: 'not.eq.published',
          order: 'updated_at.desc',
          limit: '12',
        })
        return ['content_titles', Array.isArray(rows) ? rows.map((r) => r.title).filter(Boolean) : []]
      }
      return [key, null]
    })
    const fields = await Promise.all(tasks0)
    return Object.fromEntries([['userId', userId], ...fields])
  }

  /* ------------------------------------------------------- Screen builders --- */
  /* Every screen returns { text, markup }; it then arrives as a new message   */
  /* (command) or edits the existing one (inline button).                      */

  function menuScreen(linked) {
    const lines = [
      '<b>🖤 MARA OS ASSISTANT</b>  <i>· creator operating system</i>',
      RULE,
      '',
    ]
    if (linked) {
      lines.push(
        '👥 <b>Fans</b> · 💬 <b>Inbox</b> · 🎬 <b>Content</b> · 📺 <b>Episodes</b>',
        '📊 <b>Analytics</b> · 💰 <b>Revenue</b> · ✅ <b>Tasks</b>',
        '🤖 <b>AI</b> · ⚙️ <b>Automations</b> · 📡 <b>Status</b>',
        '',
        '<i>Pick a section — the screen updates in place, no chat spam.</i>',
      )
    } else {
      lines.push(
        'The console shell is ready. Connect your account with the button',
        'below — fan, inbox, content and revenue summaries will appear here.',
        '',
        '<i>You can peek into sections before linking: the bot will guide you.</i>',
      )
    }
    return { text: lines.join('\n'), markup: mainKeyboard(linked) }
  }

  const UNLINK_CONFIRM_TEXT = [
    '<b>⛓ DISCONNECT ACCOUNT?</b>',
    RULE,
    '',
    'The bot will lose access to your fan, inbox, content and revenue data.',
    'Nothing is deleted on the web — only this Telegram link goes away.',
    '',
    '<i>You can reconnect any time with a fresh code.</i>',
  ].join('\n')

  const UNLINK_CONFIRM_MARKUP = {
    inline_keyboard: [
      [{ text: '❌ Yes, disconnect', callback_data: 'unlink_confirm' }],
      [{ text: '◂ Back to menu', callback_data: 'menu' }],
    ],
  }

  function emptyScreen(lines, section) {
    return { text: [...lines, '', '<i>Add data in the web console — it shows up here.</i>'].join('\n'), markup: sectionKeyboard(section) }
  }

  async function buildFansScreen(chatId) {
    const data = await ownerData(chatId, ['fans', 'subscriptions'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const total = data.fans.length
    if (!total) {
      return emptyScreen([
        ...screenTitle('👥', 'Fans'),
        '<b>No fans yet.</b>',
        'Connect traffic channels in the console — the funnel starts here.',
      ], 'fans')
    }
    const byLevel = new Map()
    for (const fan of data.fans) {
      byLevel.set(fan.relationship_level, (byLevel.get(fan.relationship_level) ?? 0) + 1)
    }
    const fresh = inCurrentMonth(data.fans, 'joined_at', new Date(now())).length
    const lines = [
      ...screenTitle('👥', 'Fans'),
      statLine('🌍', 'Total audience', String(total)),
      statLine('💳', 'Active subscriptions', String(data.subscriptions.length)),
      statLine('✨', 'New this month', String(fresh)),
      '',
      '<b>Relationship ladder</b>',
    ]
    for (const [level, label] of Object.entries(RELATIONSHIP_LABELS)) {
      const count = byLevel.get(level) ?? 0
      const share = total > 0 ? count / total : 0
      lines.push(`${progressBar(share, 8)} ${escapeHtml(label)} — <b>${count}</b>`)
    }
    lines.push('', '<i>Details and per-fan profile — in the console.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('fans') }
  }

  async function buildMessagesScreen(chatId) {
    const data = await ownerData(chatId, ['conversations'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const unread = data.conversations.reduce((sum, c) => sum + Number(c.unread_count || 0), 0)
    const pending = data.conversations.reduce((sum, c) => sum + Number(c.awaiting_approval_count || 0), 0)
    const active = data.conversations.filter((c) => Number(c.unread_count || 0) > 0 || Number(c.awaiting_approval_count || 0) > 0)
    const lines = [
      ...screenTitle('💬', 'Inbox'),
      statLine('📨', 'Unread messages', String(unread)),
      statLine('🕐', 'AI drafts awaiting approval', String(pending)),
      statLine('🗂', 'Conversations in queue', String(active.length)),
    ]
    if (active.length === 0) {
      lines.push('', '<b>Inbox zero.</b> The notebook is up to date.', '')
    }
    lines.push('', '<i>AI drafts wait for your approval in the web console. Nothing is sent from the bot.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('messages') }
  }

  async function buildContentScreen(chatId) {
    const data = await ownerData(chatId, ['content'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    if (!data.content.length) {
      return emptyScreen([
        ...screenTitle('🎬', 'Content'),
        '<b>No content in the pipeline yet.</b>',
        'Draft the first drop in the console — scheduling shows up here.',
      ], 'content')
    }
    const count = (status) => data.content.filter((c) => c.status === status).length
    const publishedThisMonth = inCurrentMonth(
      data.content.filter((c) => c.status === 'published' && c.published_at),
      'published_at',
      new Date(now()),
    ).length
    const nextScheduled = data.content
      .filter((c) => c.status === 'scheduled' && c.scheduled_at)
      .map((c) => c.scheduled_at)
      .sort()[0]
    const lines = [
      ...screenTitle('🎬', 'Content pipeline'),
      statLine('📥', 'Drafts', String(count('draft') + count('idea'))),
      statLine('🟢', 'Ready', String(count('ready'))),
      statLine('🗓', 'Scheduled', String(count('scheduled'))),
      statLine('📤', `Published in ${formatMonth(new Date(now()))}`, String(publishedThisMonth)),
    ]
    if (nextScheduled) {
      const inDays = daysUntil(nextScheduled, new Date(now()))
      const countdown = inDays === null || inDays < 0
        ? ''
        : inDays === 0
          ? ' · <b>today</b>'
          : ` · in <b>${inDays} ${plural(inDays, 'day')}</b>`
      lines.push(statLine('⏳', 'Next drop', formatDate(nextScheduled)) + countdown)
    }
    lines.push('', '<i>Asset vault and episodes — in the console.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('content') }
  }

  async function buildAnalyticsScreen(chatId) {
    const data = await ownerData(chatId, ['revenue'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const month = inCurrentMonth(data.revenue, 'occurred_at', new Date(now()))
    const total = month.reduce((sum, r) => sum + Number(r.amount || 0), 0)
    const byCategory = new Map()
    for (const row of month) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + Number(row.amount || 0))
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    const monthName = formatMonth(new Date(now())).toUpperCase()
    const emoji = { subscription: '🔁', ppv: '🔓', tip: '💝', custom: '🎁', affiliate: '🤝', other: '📦' }
    const lines = [
      ...screenTitle('📊', `Revenue · ${monthName}`),
      `Total: <b>${escapeHtml(formatMoney(total))}</b> · ${month.length} ${plural(month.length, 'event')}`,
      '',
    ]
    if (top.length && total > 0) {
      for (const [category, amount] of top) {
        const share = Math.round((amount / total) * 100)
        lines.push(
          `${emoji[category] ?? '📦'} ${progressBar(amount / total, 8)} <b>${escapeHtml(category)}</b> — ${escapeHtml(formatMoney(amount))} · ${share}%`,
        )
      }
    } else {
      lines.push('No revenue events this month yet.', '')
    }
    lines.push('', '<i>Source: revenue_events (this account). Funnel and cohort views live in Analytics in the console.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('analytics') }
  }

  async function buildTasksScreen(chatId) {
    const data = await ownerData(chatId, ['tasks'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const open = data.tasks
    const lines = [
      ...screenTitle('✅', 'Tasks'),
      statLine('📋', 'Open', String(open.length)),
    ]
    if (!open.length) {
      lines.push('', '<b>All clear.</b> Nothing waits for your decision.', '')
    } else {
      const prio = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪️' }
      lines.push('')
      for (const task of open.slice(0, 6)) {
        const inDays = task.due_date ? daysUntil(task.due_date, new Date(now())) : null
        const due = inDays === null
          ? 'no date'
          : inDays < 0
            ? '⚠️ overdue'
            : inDays === 0
              ? 'due today'
              : `${inDays}d left`
        lines.push(`${prio[task.priority] ?? '⚪️'} ${escapeHtml(task.title)} · <i>${due}</i>`)
      }
      if (open.length > 6) lines.push(`<i>…and ${open.length - 6} more in the console.</i>`)
      lines.push('')
    }
    lines.push('<i>Some tasks come from AI agents — approval stays with you.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('tasks') }
  }

  async function buildAiScreen(chatId) {
    const data = await ownerData(chatId, ['ai_runs', 'tasks'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const runs = data.ai_runs
    const ok = runs.filter((r) => r.status === 'success').length
    const failed = runs.filter((r) => r.status === 'error').length
    const byAgent = new Map()
    for (const run of runs) {
      byAgent.set(run.agent, (byAgent.get(run.agent) ?? 0) + 1)
    }
    const lines = [
      ...screenTitle('🤖', 'AI studio · today'),
      statLine('⚙️', 'Runs today', String(runs.length)),
      statLine('✅', 'Successful', runs.length ? `${ok} of ${runs.length}` : '0'),
      failed ? statLine('🔴', 'Failed', String(failed)) : '',
      statLine('🔌', 'AI provider', aiClient.isConfigured ? escapeHtml(aiClient.providerLabel) : 'not configured'),
      '',
      '<b>Agents</b>',
    ].filter((line) => line !== '')
    for (const agent of AI_AGENTS) {
      const count = byAgent.get(agent.id) ?? 0
      lines.push(`▸ <b>${escapeHtml(agent.label)}</b> — ${escapeHtml(agent.role)}${count ? ` · ${count} today` : ''}`)
    }
    const unknown = [...byAgent.keys()].filter((a) => !AI_AGENTS.some((agent) => agent.id === a))
    for (const agent of unknown.slice(0, 4)) {
      lines.push(`▸ <b>${escapeHtml(agent)}</b> — ${byAgent.get(agent)} today`)
    }
    if (!aiClient.isConfigured) {
      lines.push('', '<i>Provider key is not set: briefings and ideas answer with a setup notice instead of fake output (AI_API_KEY on the bot service).</i>')
    }
    const markup = sectionKeyboard('ai', [[
      { text: '💡 Ideas', callback_data: 'ai:ideas' },
      { text: '📑 Briefings', callback_data: 'ai:brief' },
      { text: '🕐 Drafts queue', callback_data: 'drafts' },
    ]])
    return { text: lines.join('\n'), markup }
  }

  /* -------------------------------------------------- new Mara sections --- */

  const EPISODE_LABELS = {
    outline: '📝 Outline',
    in_production: '🎬 In production',
    scheduled: '🗓 Scheduled',
    published: '📤 Published',
    archived: '🗄 Archived',
  }

  async function buildEpisodesScreen(chatId) {
    const data = await ownerData(chatId, ['episodes'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const episodes = data.episodes
    if (!episodes.length) {
      return emptyScreen([
        ...screenTitle('📺', 'Episodes'),
        '<b>No story episodes yet.</b>',
        'Outline the first arc in the console — progress shows up here.',
      ], 'episodes')
    }
    const byStatus = (status) => episodes.filter((e) => e.status === status)
    const lines = [
      ...screenTitle('📺', 'Episodes'),
      statLine('🗂', 'Total', String(episodes.length)),
      statLine('🎬', 'In production', String(byStatus('in_production').length)),
      statLine('🗓', 'Scheduled', String(byStatus('scheduled').length)),
      statLine('📤', 'Published', String(byStatus('published').length)),
      '',
      '<b>Current board</b>',
    ]
    const active = episodes.filter((e) => e.status !== 'archived').slice(-6)
    for (const episode of active) {
      lines.push(`${EPISODE_LABELS[episode.status] ?? '▸'} <b>#${episode.number} ${escapeHtml(episode.title)}</b>`)
    }
    lines.push('', '<i>Full episode board and key events — in the console.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('episodes') }
  }

  async function buildRevenueScreen(chatId) {
    const data = await ownerData(chatId, ['revenue', 'subscriptions', 'purchases'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const monthName = formatMonth(new Date(now()))
    const monthEvents = inCurrentMonth(data.revenue, 'occurred_at', new Date(now()))
    const monthTotal = monthEvents.reduce((sum, r) => sum + Number(r.amount || 0), 0)
    const paidPurchases = data.purchases.filter((p) => p.status === 'paid')
    const monthPurchases = inCurrentMonth(paidPurchases, 'purchased_at', new Date(now()))
    const lines = [
      ...screenTitle('💰', `Revenue · ${monthName}`),
      statLine('🧾', 'Revenue this month', escapeHtml(formatMoney(monthTotal))),
      statLine('🛍', `Paid purchases in ${monthName}`, String(monthPurchases.length)),
      statLine('💳', 'Active subscriptions', String(data.subscriptions.length)),
      statLine('🗃', 'Purchases on record', String(paidPurchases.length)),
    ]
    if (!data.revenue.length && !paidPurchases.length && !data.subscriptions.length) {
      lines.push('', '<b>No commerce data yet.</b> Sales and subscriptions appear here once offers go live.')
    }
    lines.push('', '<i>Source: revenue_events, purchases, subscriptions. Per-offer and cohort views — in the console.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('revenue') }
  }

  async function buildAutomationsScreen(chatId) {
    const data = await ownerData(chatId, ['automations', 'automation_runs'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const automations = data.automations
    const lines = [...screenTitle('⚙️', 'Automations')]
    if (!automations.length) {
      return emptyScreen([
        ...lines,
        '<b>No automations configured.</b>',
        'Build one in the console — state and runs show up here.',
      ], 'automations')
    }
    const enabled = automations.filter((a) => a.enabled)
    lines.push(
      statLine('🗂', 'Configured', String(automations.length)),
      statLine('🟢', 'Enabled', String(enabled.length)),
    )
    const recentRuns = data.automation_runs.slice(0, 20)
    const failures = recentRuns.filter((r) => r.status === 'error').length
    lines.push(statLine('🔴', `Errors in last ${recentRuns.length || 0} runs`, String(failures)), '')
    for (const a of automations.slice(0, 6)) {
      const state = a.enabled ? `🟢 ${escapeHtml(a.status)}` : `⚪️ ${escapeHtml(a.status)} (off)`
      const last = a.last_run_at ? ` · last ${formatDate(a.last_run_at)}` : ' · never run'
      lines.push(`▸ <b>${escapeHtml(a.name)}</b> — ${state}${last}`)
    }
    lines.push(
      '',
      '<i>The execution engine is not built yet: runs are manual from the console.',
      'Failure alerts can arrive here — enable them in /settings.</i>',
    )
    return { text: lines.join('\n'), markup: sectionKeyboard('automations') }
  }

  /* --------------------------------------------------------------- status --- */

  /**
   * Live health of each dependency, probed on demand. Every check degrades to a
   * red row instead of throwing, so /status itself stays up during incidents.
   */
  async function buildStatusScreen(chatId) {
    const checks = []

    checks.push(['🤖', 'Bot', `online · ${transportMode} mode`])

    try {
      const me = await telegramCall('getMe')
      checks.push(['📮', 'Telegram API', `reachable · @${escapeHtml(String(me?.username ?? 'unknown'))}`])
    } catch {
      checks.push(['📮', 'Telegram API', 'unreachable — check TELEGRAM_BOT_TOKEN'])
    }

    let supabaseOk = true
    try {
      await supabaseRest(`profiles?${makeSearch({ select: 'id', limit: '1' })}`)
      checks.push(['🗄', 'Supabase', 'reachable (REST + service key)'])
    } catch {
      supabaseOk = false
      checks.push(['🗄', 'Supabase', 'unreachable — check SUPABASE_URL and keys'])
    }

    let userId = null
    if (supabaseOk) {
      try {
        userId = await getLinkedUserId(chatId)
      } catch {
        userId = null
      }
    }
    checks.push(['🔗', 'This chat', supabaseOk
      ? userId ? 'linked to a Mara OS account' : 'not linked — /link'
      : 'unknown — Supabase unreachable'])

    checks.push(['🔌', 'AI provider', aiClient.isConfigured ? escapeHtml(aiClient.providerLabel) : 'not configured — set AI_API_KEY'])

    const appUrl = siteCabinetUrl()
    checks.push(['📱', 'Mini App URL', appUrl ? 'configured (HTTPS)' : 'missing — set WEB_APP_URL'])

    const lines = [...screenTitle('📡', 'Status')]
    for (const [icon, label, state] of checks) lines.push(statLine(icon, label, state))
    lines.push(
      '',
      '<b>External fan-platform integrations</b>',
      '▸ Fanvue · TikTok · Instagram · Threads — connectors are not implemented;',
      'inbox sync is done manually in the console. Nothing here pretends otherwise.',
      '',
      `<i>Checked ${formatDate(new Date(now()).toISOString())} · live probes, no cache.</i>`,
    )
    return { text: lines.join('\n'), markup: sectionKeyboard('status') }
  }

  /* ------------------------------------------------------------- settings --- */

  /** Reads the owner's notification settings row; null = defaults apply (all off). */
  async function readNotificationSettings(userId) {
    const query = makeSearch({ select: '*', user_id: `eq.${userId}`, limit: '1' })
    const rows = await supabaseRest(`telegram_notification_settings?${query}`)
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  }

  /**
   * Tolerant variant: migration 0005 may be missing on older projects — then
   * the table reads fail and the bot says so instead of crashing.
   */
  async function settingsOrMissing(userId) {
    try {
      return { row: await readNotificationSettings(userId), missing: false }
    } catch (error) {
      logger.warn?.('[settings] telegram_notification_settings unreadable (migration 0005 applied?):',
        error instanceof Error ? error.message : 'unknown error')
      return { row: null, missing: true }
    }
  }

  const MISSING_NOTIFICATIONS_TABLE_TEXT = [
    ...screenTitle('🔧', 'Settings'),
    'Notification settings need database migration <b>0005</b>',
    '(supabase/migrations/0005_telegram_notifications.sql).',
    'Apply it in the Supabase SQL editor, then reopen /settings.',
  ].join('\n')

  /** Creates the settings row if missing, then applies the patch. */
  async function writeNotificationSettings(userId, patch) {
    const existing = await readNotificationSettings(userId)
    if (!existing) {
      await supabaseRest('telegram_notification_settings', {
        method: 'POST',
        body: { user_id: userId, ...patch },
        prefer: 'return=minimal',
      })
      return { user_id: userId, enabled: false, ...patch }
    }
    await supabaseRest(`telegram_notification_settings?${makeSearch({ user_id: `eq.${userId}` })}`, {
      method: 'PATCH',
      body: patch,
      prefer: 'return=minimal',
    })
    return { ...existing, ...patch }
  }

  const NOTIFICATION_DEFAULTS = Object.freeze({
    enabled: false,
    notify_tasks: true,
    notify_inbox: true,
    notify_ai: true,
    notify_automations: true,
    notify_metrics: true,
  })

  async function buildSettingsScreen(chatId) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const { row: stored, missing } = await settingsOrMissing(userId)
    if (missing) return { text: MISSING_NOTIFICATIONS_TABLE_TEXT, markup: sectionKeyboard('settings') }
    const settings = stored ? { ...NOTIFICATION_DEFAULTS, ...stored } : NOTIFICATION_DEFAULTS
    const lines = [
      ...screenTitle('🔧', 'Settings'),
      statLine('🔗', 'Account link', 'active (this chat)'),
      '',
      '<b>Telegram notifications</b>',
      statLine('🔔', 'Digest', settings.enabled ? 'on (opt-in)' : 'off (default)'),
    ]
    const toggles = []
    for (const [field, label] of NOTIFICATION_KINDS) {
      const on = Boolean(settings[field])
      lines.push(`  ${on ? '✅' : '◻️'} ${label}`)
      toggles.push({ text: `${on ? '✅' : '◻️'} ${label.replace(/^[^\s]+\s/, '')}`, callback_data: `ntf:${field}` })
    }
    lines.push(
      '',
      '<i>Digest is delivered by the notify job (scripts/telegram-notify.mjs) only when',
      'something changed since the previous send. Nothing arrives while this is off.</i>',
    )
    const markup = {
      inline_keyboard: [
        [{ text: settings.enabled ? '🔕 Turn digest off' : '🔔 Turn digest on', callback_data: 'ntf:master' }],
        toggles.slice(0, 3),
        toggles.slice(3),
        [
          { text: '⛓ Disconnect…', callback_data: 'unlink' },
          { text: '🏠 Menu', callback_data: 'menu' },
        ],
        ...cabinetRow('settings'),
      ],
    }
    return { text: lines.join('\n'), markup }
  }

  /* -------------------------------------------- AI drafts: approve/dismiss --- */

  /**
   * Pending AI drafts (status 'awaiting_approval') with their conversation titles.
   * IDs are encoded base64url to fit the 64-byte callback_data budget.
   */
  async function pendingDrafts(userId) {
    const query = makeSearch({
      select: 'id,conversation_id,content,created_at',
      user_id: `eq.${userId}`,
      status: 'eq.awaiting_approval',
      ai_generated: 'eq.true',
      order: 'created_at.asc',
      limit: '20',
    })
    const rows = await supabaseRest(`messages?${query}`)
    if (!Array.isArray(rows) || !rows.length) return []
    const convIds = [...new Set(rows.map((r) => r.conversation_id))]
    const convs = await supabaseRest(`conversations?${makeSearch({
      select: 'id,subject',
      user_id: `eq.${userId}`,
      id: `in.(${convIds.join(',')})`,
    })}`)
    const titles = new Map((Array.isArray(convs) ? convs : []).map((c) => [c.id, c.subject || 'Conversation']))
    return rows.map((row) => ({ ...row, conversation: titles.get(row.conversation_id) ?? 'Conversation' }))
  }

  async function buildDraftsScreen(chatId, excludeIds = new Set()) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const all = await pendingDrafts(userId)
    const drafts = all.filter((d) => !excludeIds.has(d.id))
    const lines = [
      ...screenTitle('🕐', 'AI drafts awaiting your decision'),
      statLine('🗂', 'Pending', String(drafts.length)),
      '',
    ]
    const rows = []
    for (const draft of drafts.slice(0, 5)) {
      lines.push(
        `<b>${escapeHtml(draft.conversation)}</b>`,
        `<i>${escapeHtml(truncateText(draft.content, 220))}</i>`,
        '',
      )
      const key = `${uuidToB64Uuid(draft.conversation_id)}${uuidToB64Uuid(draft.id)}`
      rows.push([
        { text: `✅ Approve “${truncateText(draft.conversation, 14)}”`, callback_data: `dra${key}` },
        { text: '🗑 Dismiss', callback_data: `drx${key}` },
      ])
    }
    if (drafts.length > 5) lines.push(`<i>…and ${drafts.length - 5} more — after these five.</i>`, '')
    if (!drafts.length) lines.push('<b>Queue is empty.</b> New drafts appear after AI runs.', '')
    lines.push('<i>Approve marks the draft “approved” — like the inbox button in the console. Delivery to fans is a separate console step; the bot never sends.</i>')
    const markup = { inline_keyboard: [...rows, [{ text: '↻ Refresh', callback_data: 'drafts' }, { text: '🏠 Menu', callback_data: 'menu' }], ...cabinetRow('messages')] }
    return { text: lines.join('\n'), markup, resolvedIds: drafts.slice(0, 5).map((d) => d.id) }
  }

  /**
   * Applies the owner's decision to one draft. Mirrors the web repository
   * (supabase.ts approveDraft): approve sets status=approved without sent_at;
   * dismiss deletes the generated draft. The conversation counter is kept in
   * sync in the same way (max(0, n-1) + last_message_at on approve).
   *
   * Safety: the message must belong to the linked account and still be an
   * unapproved AI draft — otherwise the tap is stale and is ignored.
   */
  async function resolveDraft(chatId, conversationId, messageId, decision) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { handled: false }
    const check = await supabaseRest(`messages?${makeSearch({
      select: 'id,conversation_id,status,ai_generated',
      user_id: `eq.${userId}`,
      conversation_id: `eq.${conversationId}`,
      id: `eq.${messageId}`,
      limit: '1',
    })}`)
    const draft = Array.isArray(check) ? check[0] : null
    if (!draft || draft.status !== 'awaiting_approval' || draft.ai_generated !== true) {
      return { handled: true, stale: true }
    }
    const convRows = await supabaseRest(`conversations?${makeSearch({
      select: 'awaiting_approval_count',
      user_id: `eq.${userId}`,
      id: `eq.${conversationId}`,
      limit: '1',
    })}`)
    const awaiting = Array.isArray(convRows) ? Number(convRows[0]?.awaiting_approval_count ?? 0) : 0
    const nextCount = Math.max(0, awaiting - 1)
    if (decision === 'approve') {
      await supabaseRest(`messages?${makeSearch({ user_id: `eq.${userId}`, id: `eq.${messageId}` })}`, {
        method: 'PATCH',
        body: { status: 'approved', approved: true },
        prefer: 'return=minimal',
      })
      await supabaseRest(`conversations?${makeSearch({ user_id: `eq.${userId}`, id: `eq.${conversationId}` })}`, {
        method: 'PATCH',
        body: { awaiting_approval_count: nextCount, last_message_at: new Date(now()).toISOString() },
        prefer: 'return=minimal',
      })
      return { handled: true, decision }
    }
    await supabaseRest(`messages?${makeSearch({ user_id: `eq.${userId}`, id: `eq.${messageId}` })}`, {
      method: 'DELETE',
    })
    await supabaseRest(`conversations?${makeSearch({ user_id: `eq.${userId}`, id: `eq.${conversationId}` })}`, {
      method: 'PATCH',
      body: { awaiting_approval_count: nextCount },
      prefer: 'return=minimal',
    })
    return { handled: true, decision }
  }

  /* -------------------------------------------------- AI actions in chat --- */

  /** Per-account budget for AI calls; fails closed if the counter is down. */
  async function consumeAiBudget(userId) {
    try {
      return await consumeRateLimit(`ai-bot:${userId}`, AI_CALL_LIMIT.limit, AI_CALL_LIMIT.windowSeconds)
    } catch {
      return false
    }
  }

  /** Logs the run to ai_runs — the same journal the console reads. */
  async function logAiRun(userId, { agent, input = {}, output = {}, status = 'success', model = '', tokens = null, durationMs = null }) {
    try {
      await supabaseRest('ai_runs', {
        method: 'POST',
        body: {
          user_id: userId,
          agent,
          input,
          output,
          status,
          model: model || aiClient.model,
          ...(tokens === null ? {} : { tokens }),
          ...(durationMs === null ? {} : { duration_ms: Math.round(durationMs) }),
        },
        prefer: 'return=minimal',
      })
      return true
    } catch (error) {
      logger.warn?.('[ai] failed to log run:', error instanceof Error ? error.message : 'unknown error')
      return false
    }
  }

  function aiUnavailableScreen() {
    return {
      text: [
        ...screenTitle('🤖', 'AI provider not configured'),
        'The bot has no AI key, so it will not fabricate an answer.',
        '',
        'To enable: set <b>AI_API_KEY</b> (and optionally AI_BASE_URL, AI_MODEL)',
        'in the bot service environment — never as a VITE_* variable.',
      ].join('\n'),
      markup: sectionKeyboard('ai'),
    }
  }

  function aiBudgetScreen() {
    return {
      text: [
        ...screenTitle('🤖', 'AI budget reached'),
        `Limit: ${AI_CALL_LIMIT.limit} bot-side AI calls per hour. Try again later;`,
        'the console AI Studio is unlimited by this counter.',
      ].join('\n'),
      markup: sectionKeyboard('ai'),
    }
  }

  async function buildIdeasScreen(chatId) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    if (!aiClient.isConfigured) return aiUnavailableScreen()
    if (!(await consumeAiBudget(userId))) return aiBudgetScreen()
    const data = await ownerData(chatId, ['character', 'content_titles'])
    const started = now()
    try {
      const result = await aiClient.generate({
        system: BOT_SYSTEM_PROMPT,
        prompt: ideasPrompt({
          characterName: data.character?.name ?? 'Mara',
          characterDescription: data.character?.description ?? '',
          existingTitles: data.content_titles ?? [],
        }),
        temperature: 0.9,
        maxTokens: 700,
      })
      await logAiRun(userId, {
        agent: 'content',
        input: { source: 'telegram', kind: 'ideas' },
        output: { chars: result.text.length },
        status: 'success',
        model: result.model,
        tokens: result.tokens,
        durationMs: now() - started,
      })
      return {
        text: [
          ...screenTitle('💡', 'Content ideas'),
          escapeHtml(result.text.slice(0, 3200)),
          '',
          `<i>Generated by ${escapeHtml(result.model)} · logged to AI runs. Refine and schedule in the console.</i>`,
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '🔄 Regenerate', callback_data: 'ai:ideas' }, { text: '🤖 AI', callback_data: 'ai' }], ...cabinetRow('content')] },
      }
    } catch (error) {
      await logAiRun(userId, {
        agent: 'content',
        input: { source: 'telegram', kind: 'ideas' },
        output: { error: true },
        status: 'error',
        durationMs: now() - started,
      })
      if (error instanceof AiNotConfiguredError) return aiUnavailableScreen()
      logger.warn?.('[ai] ideas failed:', error instanceof Error ? error.message : 'unknown error')
      return {
        text: [
          ...screenTitle('💡', 'Content ideas'),
          'The AI provider could not answer this time. Try again in a minute.',
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '🔄 Retry', callback_data: 'ai:ideas' }, { text: '🤖 AI', callback_data: 'ai' }]] },
      }
    }
  }

  const BRIEF_KINDS = [
    ['fans', '👥 Fans briefing'],
    ['inbox', '💬 Inbox briefing'],
    ['revenue', '💰 Revenue briefing'],
  ]

  async function buildBriefMenuScreen(chatId) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const text = [
      ...screenTitle('📑', 'AI briefings'),
      'Pick a live snapshot to summarise. Numbers come from your tables;',
      'the model only narrates them. Each call is logged to AI runs.',
      aiClient.isConfigured ? '' : '',
      aiClient.isConfigured
        ? `<i>Provider: ${escapeHtml(aiClient.providerLabel)}</i>`
        : '<i>Provider is not configured — calls will tell you so instead of faking results.</i>',
    ].join('\n')
    return {
      text,
      markup: {
        inline_keyboard: [
          BRIEF_KINDS.map(([kind, label]) => ({ text: label, callback_data: `ai:sum:${kind}` })),
          [{ text: '🤖 AI', callback_data: 'ai' }, { text: '🏠 Menu', callback_data: 'menu' }],
        ],
      },
    }
  }

  /** Snapshot for the briefing prompt: compact JSON lines from real tables. */
  async function briefingSnapshot(chatId, kind) {
    const todayStart = new Date(now())
    todayStart.setUTCHours(0, 0, 0, 0)
    if (kind === 'fans') {
      const data = await ownerData(chatId, ['fans', 'subscriptions'])
      const byLevel = {}
      for (const fan of data.fans) byLevel[fan.relationship_level] = (byLevel[fan.relationship_level] ?? 0) + 1
      return {
        period: 'current month',
        total_fans: data.fans.length,
        by_relationship_level: byLevel,
        new_this_month: inCurrentMonth(data.fans, 'joined_at', new Date(now())).length,
        active_subscriptions: data.subscriptions.length,
      }
    }
    if (kind === 'inbox') {
      const data = await ownerData(chatId, ['conversations'])
      return {
        period: 'today',
        conversations_open: data.conversations.length,
        unread_messages: data.conversations.reduce((s, c) => s + Number(c.unread_count || 0), 0),
        drafts_awaiting_approval: data.conversations.reduce((s, c) => s + Number(c.awaiting_approval_count || 0), 0),
      }
    }
    const data = await ownerData(chatId, ['revenue', 'subscriptions', 'purchases'])
    const month = inCurrentMonth(data.revenue, 'occurred_at', new Date(now()))
    return {
      period: formatMonth(new Date(now())),
      revenue_events_this_month: month.length,
      revenue_total_this_month: Math.round(month.reduce((s, r) => s + Number(r.amount || 0), 0)),
      active_subscriptions: data.subscriptions.length,
      paid_purchases_on_record: data.purchases.filter((p) => p.status === 'paid').length,
    }
  }

  async function buildBriefScreen(chatId, kind) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    if (!aiClient.isConfigured) return aiUnavailableScreen()
    if (!(await consumeAiBudget(userId))) return aiBudgetScreen()
    const started = now()
    try {
      const snapshot = await briefingSnapshot(chatId, kind)
      const result = await aiClient.generate({
        system: BOT_SYSTEM_PROMPT,
        prompt: summaryPrompt(kind, JSON.stringify(snapshot, null, 1)),
        temperature: 0.4,
        maxTokens: 500,
      })
      await logAiRun(userId, {
        agent: 'analytics',
        input: { source: 'telegram', kind: `brief:${kind}` },
        output: { chars: result.text.length },
        status: 'success',
        model: result.model,
        tokens: result.tokens,
        durationMs: now() - started,
      })
      const label = BRIEF_KINDS.find(([k]) => k === kind)?.[1] ?? kind
      return {
        text: [
          ...screenTitle('📑', label.replace(/^[^\s]+\s/, '')),
          escapeHtml(result.text.slice(0, 3000)),
          '',
          `<i>Source: live tables · ${escapeHtml(result.model)} · logged to AI runs.</i>`,
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '📑 Briefings', callback_data: 'ai:brief' }, { text: '🤖 AI', callback_data: 'ai' }, { text: '🏠 Menu', callback_data: 'menu' }]] },
      }
    } catch (error) {
      await logAiRun(userId, {
        agent: 'analytics',
        input: { source: 'telegram', kind: `brief:${kind}` },
        output: { error: true },
        status: 'error',
        durationMs: now() - started,
      })
      if (error instanceof AiNotConfiguredError) return aiUnavailableScreen()
      logger.warn?.('[ai] briefing failed:', error instanceof Error ? error.message : 'unknown error')
      return {
        text: [
          ...screenTitle('📑', 'AI briefing'),
          'The AI provider could not answer this time. Try again in a minute.',
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '📑 Briefings', callback_data: 'ai:brief' }, { text: '🤖 AI', callback_data: 'ai' }]] },
      }
    }
  }

  /* ---------------------------------------------------- digest (notify) --- */

  /**
   * Builds the opt-in digest for one linked chat. Pure read: the watermark is
   * returned to the caller and must be persisted (writeNotificationSettings)
   * AFTER the message is actually delivered — a failed send never loses events.
   * Returns { skipped } when nothing changed or digest is off (no spam).
   */
  async function buildDigest(chatId) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { skipped: 'not-linked' }
    const { row: stored, missing } = await settingsOrMissing(userId)
    if (missing) return { skipped: 'no-table', userId }
    const settings = stored ? { ...NOTIFICATION_DEFAULTS, ...stored } : NOTIFICATION_DEFAULTS
    if (!settings.enabled) return { skipped: 'disabled', userId }

    const watermark = stored?.watermark && typeof stored.watermark === 'object' ? stored.watermark : {}
    const since = (key, field) => {
      const value = watermark[key]
      return typeof value === 'string' && value ? { [field]: `gt.${value}` } : { [field]: `gte.${new Date(0).toISOString()}` }
    }
    const next = { ...watermark }
    const advance = (key, stamp) => {
      if (!next[key] || String(stamp) > String(next[key])) next[key] = String(stamp)
    }
    const stamp = new Date(now()).toISOString()
    const lines = []

    if (settings.notify_tasks) {
      const rows = await readUserRows('tasks', userId, 'title,created_at', { ...since('tasks', 'created_at'), order: 'created_at.asc', limit: '10' })
      const fresh = Array.isArray(rows) ? rows : []
      if (fresh.length) {
        lines.push(`📋 <b>${fresh.length}</b> new ${plural(fresh.length, 'task')}: ${escapeHtml(truncateText(fresh[0].title, 48))}${fresh.length > 1 ? '…' : ''}`)
      }
      advance('tasks', stamp)
    }
    if (settings.notify_inbox) {
      const rows = await readUserRows('conversations', userId, 'unread_count,awaiting_approval_count,last_message_at', {
        ...since('inbox', 'last_message_at'),
        limit: '100',
      })
      const list = Array.isArray(rows) ? rows : []
      const unread = list.reduce((s, c) => s + Number(c.unread_count || 0), 0)
      const pending = list.reduce((s, c) => s + Number(c.awaiting_approval_count || 0), 0)
      if (unread || pending) lines.push(`💬 Inbox: <b>${unread}</b> unread · <b>${pending}</b> drafts awaiting your decision`)
      advance('inbox', stamp)
    }
    if (settings.notify_ai) {
      const rows = await readUserRows('ai_runs', userId, 'agent,status,created_at', { ...since('ai', 'created_at'), limit: '100' })
      const runs = Array.isArray(rows) ? rows : []
      const failed = runs.filter((r) => r.status === 'error').length
      if (runs.length) lines.push(`🤖 AI: <b>${runs.length}</b> completed ${plural(runs.length, 'run')}${failed ? ` · <b>${failed}</b> failed` : ''}`)
      advance('ai', stamp)
    }
    if (settings.notify_automations) {
      const rows = await readUserRows('automation_runs', userId, 'status,finished_at,started_at', { ...since('automation', 'started_at'), limit: '50' })
      const errors = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'error')
      if (errors.length) lines.push(`⚙️ Automations: <b>${errors.length}</b> failed ${plural(errors.length, 'run')} — see the console`)
      advance('automation', stamp)
    }
    if (settings.notify_metrics) {
      const rows = await readUserRows('revenue_events', userId, 'amount,occurred_at', { ...since('metrics', 'occurred_at'), limit: '200' })
      const events = Array.isArray(rows) ? rows : []
      if (events.length) {
        const total = events.reduce((s, r) => s + Number(r.amount || 0), 0)
        lines.push(`📈 Metrics: <b>${escapeHtml(formatMoney(total))}</b> across <b>${events.length}</b> revenue ${plural(events.length, 'event')}`)
      }
      const fans = await readUserRows('fans', userId, 'joined_at', { ...since('metrics_fans', 'joined_at'), limit: '200' })
      const freshFans = Array.isArray(fans) ? fans.length : 0
      if (freshFans) lines.push(`👥 Audience: <b>${freshFans}</b> new ${plural(freshFans, 'fan')}`)
      advance('metrics', stamp)
      advance('metrics_fans', stamp)
    }

    if (!lines.length) {
      return { skipped: 'quiet', watermark: next, userId }
    }

    return {
      skipped: null,
      userId,
      watermark: next,
      text: [
        '<b>🔔 MARA OS DIGEST</b>',
        RULE,
        '',
        ...lines,
        '',
        '<i>Opt-in digest · change sections or turn off in /settings.</i>',
      ].join('\n'),
    }
  }

  const SCREEN_BUILDERS = {
    fans: buildFansScreen,
    messages: buildMessagesScreen,
    content: buildContentScreen,
    episodes: buildEpisodesScreen,
    analytics: buildAnalyticsScreen,
    revenue: buildRevenueScreen,
    tasks: buildTasksScreen,
    ai: buildAiScreen,
    automations: buildAutomationsScreen,
    status: buildStatusScreen,
    settings: buildSettingsScreen,
    drafts: buildDraftsScreen,
  }

  async function showWelcome(chatId, firstName = '') {
    const userId = await getLinkedUserId(chatId)
    const name = firstName ? `, ${escapeHtml(firstName)}` : ''
    const intro = userId
      ? [
          `<b>🖤 Welcome back${name}.</b>`,
          '<i>Mara OS — the operating system behind the persona — is online.</i>',
          RULE,
          '',
          '👥 audience stats · 💬 inbox triage · 🎬 content pipeline',
          '📊 revenue · ✅ tasks · 🤖 AI runs',
          '',
          '<i>Buttons below switch sections in place — no chat clutter.</i>',
        ]
      : [
          `<b>🖤 Hello${name}.</b>`,
          '<i>Mara OS Assistant — your creator console in this chat.</i>',
          RULE,
          '',
          'Fans by relationship level, unread inbox, content calendar,',
          'revenue and AI agent runs — straight from your account.',
          '',
          '<i>Connect the account with the button below — takes under a minute.</i>',
        ]
    const text = intro.join('\n')
    return sendMessage(chatId, text, { reply_markup: mainKeyboard(Boolean(userId)) })
  }

  async function createLink(chatId, telegramUserId, displayName = '') {
    if (await getLinkedUserId(chatId)) {
      return sendMessage(chatId, [
        '<b>🔗 ALREADY CONNECTED</b>',
        RULE,
        '',
        'This Telegram chat is linked to a Mara OS account. To switch',
        'accounts, disconnect first with /unlink.',
      ].join('\n'), { reply_markup: mainKeyboard(true) })
    }

    const staleCodes = makeSearch({ telegram_chat_id: `eq.${chatId}`, used_at: 'is.null' })
    await supabaseRest(`telegram_link_codes?${staleCodes}`, { method: 'DELETE' })
    const expired = makeSearch({ expires_at: `lt.${new Date(now()).toISOString()}` })
    await supabaseRest(`telegram_link_codes?${expired}`, { method: 'DELETE' })

    const code = createLinkCode()
    const expiresAt = new Date(now() + CODE_TTL_MS).toISOString()
    await supabaseRest('telegram_link_codes', {
      method: 'POST',
      body: {
        code_hash: hashLinkCode(code),
        telegram_chat_id: chatId,
        telegram_user_id: telegramUserId,
        telegram_display: displayName,
        expires_at: expiresAt,
      },
      prefer: 'return=minimal',
    })

    const formatted = formatLinkCode(code)
    const text = [
      '<b>🔗 CONNECTION CODE</b>',
      RULE,
      '',
      `<b><code>${formatted}</code></b>`,
      '',
      '1️⃣ Open the console → Settings → Telegram',
      '2️⃣ Enter the code from this message',
      '3️⃣ Stats and summaries appear right here',
      '',
      '<i>⏱ One-time code · valid for 10 minutes</i>',
      '<i>Never share this code — it is the key to your account.</i>',
    ].join('\n')
    const openBotSection = cabinetRow('telegram', '📱 Enter code in console')
    return sendMessage(chatId, text, { reply_markup: openBotSection.length ? { inline_keyboard: openBotSection } : undefined })
  }

  async function unlinkChat(chatId) {
    const query = makeSearch({ telegram_chat_id: `eq.${chatId}` })
    const result = await supabaseRest(`telegram_links?${query}`, {
      method: 'DELETE',
      prefer: 'return=representation',
    })
    const linked = Array.isArray(result) ? result.length > 0 : true
    if (!linked) {
      return { ok: false }
    }
    return { ok: true }
  }

  /** Deliver a screen as a new message (chat command). */
  async function sendScreen(chatId, screen) {
    return sendMessage(chatId, screen.text, { reply_markup: screen.markup })
  }

  /** Edit the screen in place (inline button). */
  async function editScreen(chatId, messageId, screen) {
    return updateScreen(chatId, messageId, screen.text, screen.markup)
  }

  /** Screen by action name; fresh data behind a "typing…" indicator. */
  async function runAction(chatId, action, { messageId = null, telegramUserId = null, from = null } = {}) {
    if (action === 'link') {
      return createLink(chatId, telegramUserId ?? chatId, telegramDisplayName(from))
    }
    if (action === 'unlink') {
      // Two-step disconnect: confirmation screen first.
      const screen = { text: UNLINK_CONFIRM_TEXT, markup: UNLINK_CONFIRM_MARKUP }
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    if (action === 'unlink_confirm') {
      const outcome = await unlinkChat(chatId)
      const screen = outcome.ok
        ? {
            text: [
              '<b>✅ ACCESS REVOKED</b>',
              RULE,
              '',
              'Link removed: the bot no longer sees your account data.',
              '',
              '<i>Reconnect any time — /link.</i>',
            ].join('\n'),
            markup: connectKeyboard(),
          }
        : {
            text: [
              '<b>⛓ NOT CONNECTED</b>',
              RULE,
              '',
              'This Telegram was not linked to an account anyway.',
              '',
              '<i>To connect — /link or the button below.</i>',
            ].join('\n'),
            markup: connectKeyboard(),
          }
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    if (action === 'menu') {
      await sendTyping(chatId)
      const userId = await getLinkedUserId(chatId)
      const screen = menuScreen(Boolean(userId))
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    /* -- compound actions: '<prefix>…' callbacks -------------------------- */
    if (action === 'ai:ideas' || action === 'ai:brief' || action.startsWith('ai:sum:')) {
      await sendTyping(chatId)
      const screen = action === 'ai:ideas'
        ? await buildIdeasScreen(chatId)
        : action === 'ai:brief'
          ? await buildBriefMenuScreen(chatId)
          : await buildBriefScreen(chatId, action.slice('ai:sum:'.length))
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    if (action.startsWith('ntf:')) {
      const field = action.slice(4)
      const userId = await getLinkedUserId(chatId)
      if (userId) {
        try {
          if (field === 'master') {
            const stored = await readNotificationSettings(userId)
            await writeNotificationSettings(userId, { enabled: !(stored?.enabled ?? false) })
          } else if (NOTIFICATION_KINDS.some(([key]) => key === field)) {
            const stored = await readNotificationSettings(userId)
            const current = stored ? { ...NOTIFICATION_DEFAULTS, ...stored } : NOTIFICATION_DEFAULTS
            await writeNotificationSettings(userId, { [field]: !current[field] })
          }
        } catch (error) {
          logger.warn?.('[settings] toggle failed (migration 0005 applied?):', error instanceof Error ? error.message : 'unknown error')
        }
      }
      const screen = await buildSettingsScreen(chatId)
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    if (action.startsWith('dra') || action.startsWith('drx')) {
      // Draft decision: 'dra<22 conv><22 msg>' approve / 'drx…' dismiss (base64url ids).
      const key = action.slice(3)
      const conversationId = b64UuidToUuid(key.slice(0, 22))
      const messageId = b64UuidToUuid(key.slice(22, 44))
      const decision = action.startsWith('dra') ? 'approve' : 'dismiss'
      let note = 'That draft was already resolved elsewhere.'
      if (conversationId && messageId) {
        try {
          const result = await resolveDraft(chatId, conversationId, messageId, decision)
          if (result.decision === 'approve') note = 'Draft approved — counter synced. Delivery stays a console step.'
          else if (result.decision === 'dismiss') note = 'Draft dismissed and removed.'
        } catch (error) {
          logger.error?.('[drafts] decision failed:', error instanceof Error ? error.message : 'unknown error')
          note = 'Could not apply the decision — please retry.'
        }
      }
      const screen = await buildDraftsScreen(chatId)
      const text = `${screen.text}\n\n<i>${escapeHtml(note)}</i>`
      return messageId === null ? sendMessage(chatId, text, { reply_markup: screen.markup }) : updateScreen(chatId, messageId, text, screen.markup)
    }
    const builder = SCREEN_BUILDERS[action]
    if (builder) {
      await sendTyping(chatId)
      const screen = await builder(chatId)
      return messageId === null ? sendScreen(chatId, screen) : editScreen(chatId, messageId, screen)
    }
    return sendMessage(chatId, HELP_TEXT, { reply_markup: mainKeyboard(Boolean(await getLinkedUserId(chatId))) })
  }

  async function handleMessage(message) {
    const chat = message?.chat
    if (!chat || chat.type !== 'private' || !message.from) return
    const text = String(message.text ?? '').trim()
    if (!text) return

    const [firstToken] = text.split(/\s+/, 1)
    const command = firstToken.toLowerCase().split('@')[0]
    const word = text.toLowerCase()
    if (command === '/start' || command === '/menu' || word === 'menu') {
      return showWelcome(chat.id, message.from.first_name)
    }
    if (command === '/help' || word === 'help') {
      const userId = await getLinkedUserId(chat.id)
      return sendMessage(chat.id, HELP_TEXT, { reply_markup: mainKeyboard(Boolean(userId)) })
    }
    if (command === '/link' || word === 'connect') {
      return createLink(chat.id, message.from.id, telegramDisplayName(message.from))
    }
    if (command === '/unlink' || word === 'disconnect') {
      return runAction(chat.id, 'unlink', { telegramUserId: message.from.id })
    }
    if (command === '/fans' || word === 'fans' || word === 'audience') return runAction(chat.id, 'fans')
    if (command === '/messages' || word === 'inbox' || word === 'messages') return runAction(chat.id, 'messages')
    if (command === '/content' || word === 'content' || word === 'pipeline') return runAction(chat.id, 'content')
    if (command === '/episodes' || word === 'episodes' || word === 'series') return runAction(chat.id, 'episodes')
    if (command === '/analytics' || word === 'stats') return runAction(chat.id, 'analytics')
    if (command === '/revenue' || word === 'revenue' || word === 'money' || word === 'sales') return runAction(chat.id, 'revenue')
    if (command === '/tasks' || word === 'tasks' || word === 'todo') return runAction(chat.id, 'tasks')
    if (command === '/automations' || word === 'automations' || word === 'automation') return runAction(chat.id, 'automations')
    if (command === '/status' || word === 'status' || word === 'health') return runAction(chat.id, 'status')
    if (command === '/settings' || word === 'settings' || word === 'notifications') return runAction(chat.id, 'settings')
    if (command === '/ideas' || word === 'ideas') return runAction(chat.id, 'ai:ideas')
    if (command === '/drafts' || word === 'drafts' || word === 'queue') return runAction(chat.id, 'drafts')
    if (command === '/brief' || word === 'brief' || word === 'summary') return runAction(chat.id, 'ai:brief')
    if (command === '/ai' || word === 'ai' || word === 'agents') return runAction(chat.id, 'ai')
    if (command.startsWith('/')) {
      const userId = await getLinkedUserId(chat.id)
      return sendMessage(chat.id, HELP_TEXT, { reply_markup: mainKeyboard(Boolean(userId)) })
    }
    const userId = await getLinkedUserId(chat.id)
    return sendMessage(chat.id, [
      '<b>🤖 DID NOT PARSE THAT</b>',
      RULE,
      '',
      'Use the menu buttons, commands (/help) or words:',
      '<b>fans</b> · <b>inbox</b> · <b>content</b> · <b>episodes</b> · <b>revenue</b> · <b>tasks</b>',
      '<b>ai</b> · <b>automations</b> · <b>status</b> · <b>settings</b> · <b>menu</b>.',
    ].join('\n'), { reply_markup: mainKeyboard(Boolean(userId)) })
  }

  async function handleCallback(callback) {
    if (!callback?.message?.chat || callback.message.chat.type !== 'private') return
    const chatId = callback.message.chat.id
    const messageId = callback.message.message_id
    const action = String(callback.data ?? '')
    await telegramCall('answerCallbackQuery', { callback_query_id: callback.id })
    return runAction(chatId, action, {
      messageId: Number.isInteger(messageId) ? messageId : null,
      telegramUserId: callback.from?.id ?? null,
      from: callback.from ?? null,
    })
  }

  /** Handles a single Telegram update (webhook or polling). */
  async function handleUpdate(update) {
    if (!update) return undefined
    if (update.message) return handleMessage(update.message)
    if (update.callback_query) return handleCallback(update.callback_query)
    return undefined
  }

  /** Bot description, commands and menu button — runs on deployment. */
  async function applyBotProfile() {
    await telegramCall('setMyDescription', { description: BOT_DESCRIPTION })
    await telegramCall('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION })
    // Menu button opens the Mini App; commands stay available via "/" and the command list.
    const menuButton = miniAppMenuButton(webAppUrl)
    if (menuButton.type !== 'web_app') {
      logger.warn?.('[telegram] WEB_APP_URL is empty or not HTTPS: menu button falls back to the command list.')
    }
    await telegramCall('setChatMenuButton', { menu_button: menuButton })
    await telegramCall('setMyCommands', { commands: BOT_COMMANDS })
  }

  /**
   * Body of GET /health.
   *
   * @param {object} state
   * @param {'polling'|'webhook'} state.mode
   * @param {'starting'|'online'|'degraded'|'stopped'} [state.pollingStatus]
   * @param {number|null} [state.lastSuccessfulAt] time of the last successful update
   */
  function healthReport({ mode, pollingStatus = 'stopped', lastSuccessfulAt = null } = {}) {
    const configured = Boolean(telegramToken)
    const fresh = lastSuccessfulAt !== null && now() - lastSuccessfulAt < 120_000
    const online = configured && pollingStatus === 'online' && (mode === 'webhook' ? true : fresh)
    return {
      ok: online,
      service: SERVICE_NAME,
      mode,
      configured,
      botPolling: configured ? (online ? 'online' : pollingStatus) : 'stopped',
      lastSuccessfulPollAt: lastSuccessfulAt ? new Date(lastSuccessfulAt).toISOString() : null,
    }
  }

  return {
    telegramCall,
    supabaseRest,
    verifySiteSession,
    linkStatus,
    previewLinkForUser,
    consumeRateLimit,
    confirmLinkForUser,
    unlink,
    handleUpdate,
    applyBotProfile,
    healthReport,
    mainKeyboard,
    sendMessage,
    siteCabinetUrl,
    progressBar,
    /* AI + owner actions (tests, notify job) */
    aiClient,
    buildDigest,
    pendingDrafts,
    resolveDraft,
    readNotificationSettings,
    writeNotificationSettings,
    getLinkedUserId,
    runAction,
  }
}
