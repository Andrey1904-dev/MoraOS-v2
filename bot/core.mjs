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
} from './format.mjs'

export { LINK_CODE_PATTERN }

/** How long a one-time link code lives. */
export const CODE_TTL_MS = 10 * 60 * 1000

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
  '/fans — audience by relationship level',
  '/messages — inbox: unread and drafts awaiting approval',
  '/content — pipeline: ready, scheduled, published',
  '/analytics — revenue this month by source',
  '/tasks — open tasks by priority',
  '/ai — today’s AI agent runs',
  '/link — connect this chat to your Mara OS account',
  '/unlink — disconnect (two-step confirmation)',
  '',
  '<i>The bot only reads your account data. Nothing is sent to fans from here:',
  'AI drafts stay in the web console until you approve them there.</i>',
].join('\n')

export const BOT_DESCRIPTION =
  'Mara OS Assistant — the Telegram companion of the creator operating system. ' +
  'Audience stats, inbox triage, content pipeline, revenue and AI runs from your Mara OS account. ' +
  'A one-time /link code connects this chat to your console. Nothing is sent to fans from the bot.'
export const BOT_SHORT_DESCRIPTION = 'Mara OS: fans, inbox, content, revenue and AI — in your pocket.'

export const BOT_COMMANDS = [
  { command: 'start', description: 'Welcome screen and quick tour' },
  { command: 'menu', description: 'Dashboard and sections' },
  { command: 'fans', description: 'Audience by relationship level' },
  { command: 'messages', description: 'Inbox: unread and pending drafts' },
  { command: 'content', description: 'Content pipeline snapshot' },
  { command: 'analytics', description: 'Revenue this month' },
  { command: 'tasks', description: 'Open tasks' },
  { command: 'ai', description: 'AI agent runs today' },
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

  /** POST to the Telegram Bot API. */
  async function telegramCall(method, payload = {}, timeoutMs = 18_000) {
    let response
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${telegramToken}/${method}`, {
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

  /** Main menu: CRM sections + web console. */
  function mainKeyboard(linked = true) {
    const rows = []
    if (!linked) rows.push([{ text: '🔗 Connect account', callback_data: 'link' }])
    rows.push(
      [
        { text: '👥 Fans', callback_data: 'fans' },
        { text: '💬 Inbox', callback_data: 'messages' },
        { text: '🎬 Content', callback_data: 'content' },
      ],
      [
        { text: '📊 Analytics', callback_data: 'analytics' },
        { text: '✅ Tasks', callback_data: 'tasks' },
        { text: '🤖 AI runs', callback_data: 'ai' },
      ],
      ...cabinetRow(),
    )
    return { inline_keyboard: rows }
  }

  /**
   * Context keyboard of a section screen: neighbouring sections, refresh of
   * the current one and back-to-menu. Everything inside one message.
   */
  function sectionKeyboard(current) {
    const sections = [
      ['fans', '👥 Fans'],
      ['messages', '💬 Inbox'],
      ['content', '🎬 Content'],
      ['analytics', '📊 Stats'],
      ['tasks', '✅ Tasks'],
      ['ai', '🤖 AI'],
    ].filter(([key]) => key !== current)
    const rows = []
    for (let i = 0; i < sections.length; i += 3) {
      rows.push(sections.slice(i, i + 3).map(([key, label]) => ({ text: label, callback_data: key })))
    }
    rows.push(
      [
        { text: '↻ Refresh', callback_data: current },
        { text: '🏠 Menu', callback_data: 'menu' },
      ],
      ...cabinetRow(current === 'messages' ? 'messages' : current),
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
        '👥 <b>Fans</b> — audience by relationship level',
        '💬 <b>Inbox</b> — unread messages and AI drafts on approval',
        '🎬 <b>Content</b> — what is ready, scheduled or live',
        '📊 <b>Analytics</b> — revenue this month by source',
        '✅ <b>Tasks</b> — what needs your decision',
        '🤖 <b>AI</b> — agent runs today',
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
    lines.push('', '<i>Funnel and cohort views live in Analytics in the console.</i>')
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
    const data = await ownerData(chatId, ['ai_runs'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const runs = data.ai_runs
    const ok = runs.filter((r) => r.status === 'success').length
    const byAgent = new Map()
    for (const run of runs) {
      byAgent.set(run.agent, (byAgent.get(run.agent) ?? 0) + 1)
    }
    const lines = [
      ...screenTitle('🤖', 'AI runs · today'),
      statLine('⚙️', 'Runs today', String(runs.length)),
      statLine('✅', 'Successful', runs.length ? `${ok} of ${runs.length}` : '0'),
    ]
    if (byAgent.size) {
      lines.push('', '<b>By agent</b>')
      for (const [agent, count] of [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
        lines.push(`▸ ${escapeHtml(agent)} — <b>${count}</b>`)
      }
    } else {
      lines.push('', '<b>No agent runs yet today.</b> Agents wake up with your traffic.', '')
    }
    lines.push('', '<i>Agents propose; you approve. Nothing sends itself.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('ai') }
  }

  const SCREEN_BUILDERS = {
    fans: buildFansScreen,
    messages: buildMessagesScreen,
    content: buildContentScreen,
    analytics: buildAnalyticsScreen,
    tasks: buildTasksScreen,
    ai: buildAiScreen,
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
    if (command === '/analytics' || word === 'stats' || word === 'revenue') return runAction(chat.id, 'analytics')
    if (command === '/tasks' || word === 'tasks' || word === 'todo') return runAction(chat.id, 'tasks')
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
      '<b>fans</b> · <b>inbox</b> · <b>content</b> · <b>stats</b> · <b>tasks</b> · <b>ai</b> · <b>menu</b>.',
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
  }
}
