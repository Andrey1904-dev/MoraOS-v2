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
  pluralRu,
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
  { id: 'character', label: 'Персонаж', role: 'голос персонажа и границы' },
  { id: 'conversation', label: 'Диалоги', role: 'черновики ответов для инбокса' },
  { id: 'sales', label: 'Продажи', role: 'тайминг офферов и подсказки по цене' },
  { id: 'memory', label: 'Память', role: 'извлечение фактов о фанах' },
  { id: 'content', label: 'Контент', role: 'идеи, хуки и сценарии' },
  { id: 'analytics', label: 'Аналитика', role: 'сводки по метрикам' },
])

/** Notification kinds the owner can toggle in /settings (opt-in, off by default). */
export const NOTIFICATION_KINDS = Object.freeze([
  ['notify_tasks', '📋 Задачи'],
  ['notify_inbox', '💬 Решения по инбоксу'],
  ['notify_ai', '🤖 Результаты запусков AI'],
  ['notify_automations', '⚙️ Ошибки автоматизаций'],
  ['notify_metrics', '📈 Изменения метрик'],
])

export const RELATIONSHIP_LABELS = {
  visitor: 'Гости',
  follower: 'Подписчики',
  subscriber: 'Сабы',
  admirer: 'Поклонники',
  supporter: 'Спонсоры',
  inner_circle: 'Ближний круг',
}

const RULE = '━━━━━━━━━━━━━━━━'

export const HELP_TEXT = [
  '<b>🤖 MARA OS ASSISTANT — СПРАВКА</b>',
  RULE,
  '',
  '/menu — дашборд и разделы',
  '/status — состояние сервиса: Supabase, AI-провайдер, бот, интеграции',
  '/fans — аудитория по уровням отношений',
  '/messages — инбокс: непрочитанные и черновики на одобрении',
  '/content — конвейер: готово, запланировано, опубликовано',
  '/episodes — состояние эпизодов сюжета',
  '/analytics — выручка за месяц по источникам (период и источник показаны)',
  '/revenue — выручка, покупки и подписки',
  '/tasks — открытые задачи по приоритету',
  '/ai — AI-агенты, запуски, сводки и идеи контента',
  '/automations — состояния автоматизаций и последние запуски',
  '/settings — привязка аккаунта и настройки уведомлений',
  '/link — привязать этот чат к аккаунту Mara OS',
  '/unlink — отключить (двухшаговое подтверждение)',
  '',
  '<i>Бот читает данные вашего аккаунта и может одобрять/отклонять черновики AI —',
  'одобрение означает ровно это; фанам отсюда ничего не отправляется.</i>',
].join('\n')

export const BOT_DESCRIPTION =
  'Mara OS Assistant — Telegram-спутник операционной системы креатора. ' +
  'Статистика аудитории, разбор инбокса, конвейер контента, выручка и запуски AI из вашего аккаунта Mara OS. ' +
  'Одноразовый код /link привязывает этот чат к консоли. Фанам от бота ничего не отправляется.'
export const BOT_SHORT_DESCRIPTION = 'Mara OS: фаны, инбокс, контент, выручка и AI — в кармане.'

export const BOT_COMMANDS = [
  { command: 'start', description: 'Приветственный экран и быстрый тур' },
  { command: 'menu', description: 'Дашборд и разделы' },
  { command: 'status', description: 'Состояние сервиса и интеграции' },
  { command: 'fans', description: 'Аудитория по уровням отношений' },
  { command: 'messages', description: 'Инбокс: непрочитанные и черновики' },
  { command: 'content', description: 'Срез конвейера контента' },
  { command: 'episodes', description: 'Состояние эпизодов сюжета' },
  { command: 'analytics', description: 'Выручка за месяц по источникам' },
  { command: 'revenue', description: 'Выручка, покупки, подписки' },
  { command: 'tasks', description: 'Открытые задачи' },
  { command: 'ai', description: 'AI-агенты, запуски и сводки' },
  { command: 'automations', description: 'Состояния автоматизаций и запуски' },
  { command: 'settings', description: 'Привязка аккаунта и уведомления' },
  { command: 'link', description: 'Привязать чат к аккаунту' },
  { command: 'unlink', description: 'Отключить аккаунт' },
  { command: 'help', description: 'Список команд' },
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
    '<b>🔌 НЕ ПОДКЛЮЧЕНО</b>',
    RULE,
    '',
    'Этот чат в Telegram ещё не привязан к аккаунту Mara OS.',
    '',
    'Нажмите <b>Привязать аккаунт</b> ниже или отправьте /link — вы получите',
    'одноразовый код для ввода в веб-консоли.',
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
  if (!telegramToken) throw new Error('TELEGRAM_BOT_TOKEN не задан.')
  if (!supabaseUrl) throw new Error('SUPABASE_URL не задан.')
  if (!supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY не задан.')
  if (!supabaseServiceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY не задан.')

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
      throw new Error(`Telegram API connection failed: ${error instanceof Error ? error.message : 'ошибка сети'}`)
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
      throw new ApiError(502, 'Сервис данных временно недоступен. Повторите попытку.')
    }

    const text = await response.text()
    if (!response.ok) {
      logger.error?.(`[supabase] REST returned ${response.status}`)
      throw new ApiError(502, 'Не удалось прочитать данные вашего аккаунта.')
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
      throw new ApiError(401, 'Сначала войдите в аккаунт Mara OS, затем повторите.')
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
      throw new ApiError(502, 'Не удалось проверить веб-сессию. Повторите попытку.')
    }
    if (!response.ok) throw new ApiError(401, 'Веб-сессия истекла. Войдите заново.')
    const user = await response.json().catch(() => null)
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) {
      throw new ApiError(401, 'Не удалось подтвердить веб-аккаунт.')
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
      throw new ApiError(400, 'Введите одноразовый код из Telegram целиком.')
    }
    const result = await supabaseRest('rpc/link_telegram_account', {
      method: 'POST',
      body: { p_code_hash: hashLinkCode(code), p_user_id: userId },
    })
    if (result !== true) {
      throw new ApiError(400, 'Код недействителен или истёк. Запросите новый через /link.')
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
      throw new ApiError(400, 'Введите одноразовый код из Telegram целиком.')
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
      throw new ApiError(400, 'Код недействителен или истёк. Запросите новый через /link.')
    }
    return {
      telegramAccount: String(row.telegram_display || 'Telegram-аккаунт'),
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
      throw new ApiError(502, 'Не удалось проверить лимит запросов. Повторите попытку.')
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
  function cabinetRow(screen = '', text = '📱 Открыть Mara OS') {
    const url = siteCabinetUrl(screen)
    return url ? [[{ text, web_app: { url } }]] : []
  }

  /** Keyboard for a chat that is not linked yet: code with one tap. */
  function connectKeyboard() {
    return { inline_keyboard: [[{ text: '🔗 Привязать аккаунт', callback_data: 'link' }], ...cabinetRow()] }
  }

  /** Full section roster: [action key, button label, Mini App screen key]. */
  const SECTIONS = Object.freeze([
    ['fans', '👥 Фаны', 'fans'],
    ['messages', '💬 Инбокс', 'messages'],
    ['content', '🎬 Контент', 'content'],
    ['episodes', '📺 Эпизоды', 'episodes'],
    ['analytics', '📊 Аналитика', 'analytics'],
    ['revenue', '💰 Выручка', 'revenue'],
    ['tasks', '✅ Задачи', 'tasks'],
    ['ai', '🤖 AI', 'ai'],
    ['automations', '⚙️ Автоматизации', 'automations'],
    ['status', '📡 Статус', 'settings'],
    ['settings', '🔧 Настройки', 'settings'],
  ])

  /** Main menu: all sections + web console. */
  function mainKeyboard(linked = true) {
    const rows = []
    if (!linked) rows.push([{ text: '🔗 Привязать аккаунт', callback_data: 'link' }])
    const sections = SECTIONS.filter(([key]) => !(key === 'status' || key === 'settings'))
    for (let i = 0; i < sections.length; i += 3) {
      rows.push(sections.slice(i, i + 3).map(([key, label]) => ({ text: label, callback_data: key })))
    }
    rows.push([
      { text: '📡 Статус', callback_data: 'status' },
      { text: '🔧 Настройки', callback_data: 'settings' },
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
        { text: '↻ Обновить', callback_data: current },
        { text: '🏠 Меню', callback_data: 'menu' },
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
      '<b>🖤 MARA OS ASSISTANT</b>  <i>· операционная система креатора</i>',
      RULE,
      '',
    ]
    if (linked) {
      lines.push(
        '👥 <b>Фаны</b> · 💬 <b>Инбокс</b> · 🎬 <b>Контент</b> · 📺 <b>Эпизоды</b>',
        '📊 <b>Аналитика</b> · 💰 <b>Выручка</b> · ✅ <b>Задачи</b>',
        '🤖 <b>AI</b> · ⚙️ <b>Автоматизации</b> · 📡 <b>Статус</b>',
        '',
        '<i>Выберите раздел — экран обновляется на месте, без спама в чате.</i>',
      )
    } else {
      lines.push(
        'Оболочка консоли готова. Привяжите аккаунт кнопкой ниже — здесь',
        'появятся сводки по фана, инбоксу, контенту и выручке.',
        '',
        '<i>Разделы можно посмотреть и до привязки: бот подскажет, что делать.</i>',
      )
    }
    return { text: lines.join('\n'), markup: mainKeyboard(linked) }
  }

  const UNLINK_CONFIRM_TEXT = [
    '<b>⛓ ОТКЛЮЧИТЬ АККАУНТ?</b>',
    RULE,
    '',
    'Бот потеряет доступ к данным о фанах, инбоксе, контенте и выручке.',
    'В вебе ничего не удаляется — исчезает только эта привязка Telegram.',
    '',
    '<i>Подключиться заново можно в любой момент — новым кодом.</i>',
  ].join('\n')

  const UNLINK_CONFIRM_MARKUP = {
    inline_keyboard: [
      [{ text: '❌ Да, отключить', callback_data: 'unlink_confirm' }],
      [{ text: '◂ Назад в меню', callback_data: 'menu' }],
    ],
  }

  function emptyScreen(lines, section) {
    return { text: [...lines, '', '<i>Добавьте данные в веб-консоли — они появятся здесь.</i>'].join('\n'), markup: sectionKeyboard(section) }
  }

  async function buildFansScreen(chatId) {
    const data = await ownerData(chatId, ['fans', 'subscriptions'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const total = data.fans.length
    if (!total) {
      return emptyScreen([
        ...screenTitle('👥', 'Фаны'),
        '<b>Фанов пока нет.</b>',
        'Подключите каналы трафика в консоли — воронка начинается здесь.',
      ], 'fans')
    }
    const byLevel = new Map()
    for (const fan of data.fans) {
      byLevel.set(fan.relationship_level, (byLevel.get(fan.relationship_level) ?? 0) + 1)
    }
    const fresh = inCurrentMonth(data.fans, 'joined_at', new Date(now())).length
    const lines = [
      ...screenTitle('👥', 'Фаны'),
      statLine('🌍', 'Всего аудитория', String(total)),
      statLine('💳', 'Активные подписки', String(data.subscriptions.length)),
      statLine('✨', 'Новых за месяц', String(fresh)),
      '',
      '<b>Лестница отношений</b>',
    ]
    for (const [level, label] of Object.entries(RELATIONSHIP_LABELS)) {
      const count = byLevel.get(level) ?? 0
      const share = total > 0 ? count / total : 0
      lines.push(`${progressBar(share, 8)} ${escapeHtml(label)} — <b>${count}</b>`)
    }
    lines.push('', '<i>Детали и профиль каждого фана — в консоли.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('fans') }
  }

  async function buildMessagesScreen(chatId) {
    const data = await ownerData(chatId, ['conversations'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const unread = data.conversations.reduce((sum, c) => sum + Number(c.unread_count || 0), 0)
    const pending = data.conversations.reduce((sum, c) => sum + Number(c.awaiting_approval_count || 0), 0)
    const active = data.conversations.filter((c) => Number(c.unread_count || 0) > 0 || Number(c.awaiting_approval_count || 0) > 0)
    const lines = [
      ...screenTitle('💬', 'Инбокс'),
      statLine('📨', 'Непрочитанные сообщения', String(unread)),
      statLine('🕐', 'Черновики AI на одобрении', String(pending)),
      statLine('🗂', 'Диалогов в очереди', String(active.length)),
    ]
    if (active.length === 0) {
      lines.push('', '<b>Инбокс пуст.</b> Блокнот в актуальном состоянии.', '')
    }
    lines.push('', '<i>Черновики AI ждут вашего одобрения в веб-консоли. Бот ничего не отправляет.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('messages') }
  }

  async function buildContentScreen(chatId) {
    const data = await ownerData(chatId, ['content'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    if (!data.content.length) {
      return emptyScreen([
        ...screenTitle('🎬', 'Контент'),
        '<b>В конвейере пока нет контента.</b>',
        'Создайте первый дроп в консоли — расписание появится здесь.',
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
      ...screenTitle('🎬', 'Конвейер контента'),
      statLine('📥', 'Черновики', String(count('draft') + count('idea'))),
      statLine('🟢', 'Готово', String(count('ready'))),
      statLine('🗓', 'Запланировано', String(count('scheduled'))),
      statLine('📤', `Опубликовано в ${formatMonth(new Date(now()))}`, String(publishedThisMonth)),
    ]
    if (nextScheduled) {
      const inDays = daysUntil(nextScheduled, new Date(now()))
      const countdown = inDays === null || inDays < 0
        ? ''
        : inDays === 0
          ? ' · <b>сегодня</b>'
          : ` · через <b>${inDays} ${pluralRu(inDays, ['день', 'дня', 'дней'])}</b>`
      lines.push(statLine('⏳', 'Следующий дроп', formatDate(nextScheduled)) + countdown)
    }
    lines.push('', '<i>Библиотека ассетов и эпизоды — в консоли.</i>')
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
      ...screenTitle('📊', `Выручка · ${monthName}`),
      `Итого: <b>${escapeHtml(formatMoney(total))}</b> · ${month.length} ${pluralRu(month.length, ['событие', 'события', 'событий'])}`,
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
      lines.push('Событий выручки за этот месяц пока нет.', '')
    }
    lines.push('', '<i>Источник: revenue_events (этот аккаунт). Воронка и когорты — в разделе «Аналитика» в консоли.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('analytics') }
  }

  async function buildTasksScreen(chatId) {
    const data = await ownerData(chatId, ['tasks'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const open = data.tasks
    const lines = [
      ...screenTitle('✅', 'Задачи'),
      statLine('📋', 'Открыто', String(open.length)),
    ]
    if (!open.length) {
      lines.push('', '<b>Всё чисто.</b> Ничего не ждёт вашего решения.', '')
    } else {
      const prio = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪️' }
      lines.push('')
      for (const task of open.slice(0, 6)) {
        const inDays = task.due_date ? daysUntil(task.due_date, new Date(now())) : null
        const due = inDays === null
          ? 'без даты'
          : inDays < 0
            ? '⚠️ просрочено'
            : inDays === 0
              ? 'срок сегодня'
              : `осталось ${inDays} ${pluralRu(inDays, ['день', 'дня', 'дней'])}`
        lines.push(`${prio[task.priority] ?? '⚪️'} ${escapeHtml(task.title)} · <i>${due}</i>`)
      }
      if (open.length > 6) lines.push(`<i>…и ещё ${open.length - 6} в консоли.</i>`)
      lines.push('')
    }
    lines.push('<i>Часть задач приходит от AI-агентов — одобрение остаётся за вами.</i>')
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
      ...screenTitle('🤖', 'AI-студия · сегодня'),
      statLine('⚙️', 'Запусков сегодня', String(runs.length)),
      statLine('✅', 'Успешно', runs.length ? `${ok} из ${runs.length}` : '0'),
      failed ? statLine('🔴', 'С ошибками', String(failed)) : '',
      statLine('🔌', 'AI-провайдер', aiClient.isConfigured ? escapeHtml(aiClient.providerLabel) : 'не настроен'),
      '',
      '<b>Агенты</b>',
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
      lines.push('', '<i>Ключ провайдера не задан: сводки и идеи отвечают уведомлением о настройке вместо выдуманного результата (AI_API_KEY в сервисе бота).</i>')
    }
    const markup = sectionKeyboard('ai', [[
      { text: '💡 Идеи', callback_data: 'ai:ideas' },
      { text: '📑 Сводки', callback_data: 'ai:brief' },
      { text: '🕐 Очередь черновиков', callback_data: 'drafts' },
    ]])
    return { text: lines.join('\n'), markup }
  }

  /* -------------------------------------------------- new Mara sections --- */

  const EPISODE_LABELS = {
    outline: '📝 План',
    in_production: '🎬 В производстве',
    scheduled: '🗓 Запланировано',
    published: '📤 Опубликовано',
    archived: '🗄 В архиве',
  }

  async function buildEpisodesScreen(chatId) {
    const data = await ownerData(chatId, ['episodes'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const episodes = data.episodes
    if (!episodes.length) {
      return emptyScreen([
        ...screenTitle('📺', 'Эпизоды'),
        '<b>Эпизодов сюжета пока нет.</b>',
        'Распишите первую арку в консоли — прогресс появится здесь.',
      ], 'episodes')
    }
    const byStatus = (status) => episodes.filter((e) => e.status === status)
    const lines = [
      ...screenTitle('📺', 'Эпизоды'),
      statLine('🗂', 'Всего', String(episodes.length)),
      statLine('🎬', 'В производстве', String(byStatus('in_production').length)),
      statLine('🗓', 'Запланировано', String(byStatus('scheduled').length)),
      statLine('📤', 'Опубликовано', String(byStatus('published').length)),
      '',
      '<b>Текущая доска</b>',
    ]
    const active = episodes.filter((e) => e.status !== 'archived').slice(-6)
    for (const episode of active) {
      lines.push(`${EPISODE_LABELS[episode.status] ?? '▸'} <b>#${episode.number} ${escapeHtml(episode.title)}</b>`)
    }
    lines.push('', '<i>Полная доска эпизодов и ключевые события — в консоли.</i>')
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
      ...screenTitle('💰', `Выручка · ${monthName}`),
      statLine('🧾', 'Выручка за месяц', escapeHtml(formatMoney(monthTotal))),
      statLine('🛍', `Оплаченные покупки за ${monthName}`, String(monthPurchases.length)),
      statLine('💳', 'Активные подписки', String(data.subscriptions.length)),
      statLine('🗃', 'Покупок в учёте', String(paidPurchases.length)),
    ]
    if (!data.revenue.length && !paidPurchases.length && !data.subscriptions.length) {
      lines.push('', '<b>Коммерческих данных пока нет.</b> Продажи и подписки появятся здесь, когда офферы запустятся.')
    }
    lines.push('', '<i>Источник: revenue_events, purchases, subscriptions. Разрезы по офферам и когортам — в консоли.</i>')
    return { text: lines.join('\n'), markup: sectionKeyboard('revenue') }
  }

  async function buildAutomationsScreen(chatId) {
    const data = await ownerData(chatId, ['automations', 'automation_runs'])
    if (!data) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const automations = data.automations
    const lines = [...screenTitle('⚙️', 'Автоматизации')]
    if (!automations.length) {
      return emptyScreen([
        ...lines,
        '<b>Автоматизации не настроены.</b>',
        'Соберите её в консоли — состояние и запуски появятся здесь.',
      ], 'automations')
    }
    const enabled = automations.filter((a) => a.enabled)
    lines.push(
      statLine('🗂', 'Настроено', String(automations.length)),
      statLine('🟢', 'Включено', String(enabled.length)),
    )
    const recentRuns = data.automation_runs.slice(0, 20)
    const failures = recentRuns.filter((r) => r.status === 'error').length
    lines.push(statLine('🔴', `Ошибки за последние ${recentRuns.length || 0} ${pluralRu(recentRuns.length || 0, ['запуск', 'запуска', 'запусков'])}`, String(failures)), '')
    for (const a of automations.slice(0, 6)) {
      const state = a.enabled ? `🟢 ${escapeHtml(a.status)}` : `⚪️ ${escapeHtml(a.status)} (выкл.)`
      const last = a.last_run_at ? ` · последний запуск ${formatDate(a.last_run_at)}` : ' · ни разу не запускалась'
      lines.push(`▸ <b>${escapeHtml(a.name)}</b> — ${state}${last}`)
    }
    lines.push(
      '',
      '<i>Движок исполнения ещё не построен: запуски выполняются вручную из консоли.',
      'Сюда могут приходить алерты об ошибках — включите их в /settings.</i>',
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

    checks.push(['🤖', 'Бот', `онлайн · режим ${transportMode}`])

    try {
      const me = await telegramCall('getMe')
      checks.push(['📮', 'Telegram API', `доступен · @${escapeHtml(String(me?.username ?? 'неизвестно'))}`])
    } catch {
      checks.push(['📮', 'Telegram API', 'недоступен — проверьте TELEGRAM_BOT_TOKEN'])
    }

    let supabaseOk = true
    try {
      await supabaseRest(`profiles?${makeSearch({ select: 'id', limit: '1' })}`)
      checks.push(['🗄', 'Supabase', 'доступен (REST + service key)'])
    } catch {
      supabaseOk = false
      checks.push(['🗄', 'Supabase', 'недоступен — проверьте SUPABASE_URL и ключи'])
    }

    let userId = null
    if (supabaseOk) {
      try {
        userId = await getLinkedUserId(chatId)
      } catch {
        userId = null
      }
    }
    checks.push(['🔗', 'Этот чат', supabaseOk
      ? userId ? 'привязан к аккаунту Mara OS' : 'не привязан — /link'
      : 'неизвестно — Supabase недоступен'])

    checks.push(['🔌', 'AI-провайдер', aiClient.isConfigured ? escapeHtml(aiClient.providerLabel) : 'не настроен — задайте AI_API_KEY'])

    const appUrl = siteCabinetUrl()
    checks.push(['📱', 'Mini App URL', appUrl ? 'настроен (HTTPS)' : 'не задан — задайте WEB_APP_URL'])

    const lines = [...screenTitle('📡', 'Статус')]
    for (const [icon, label, state] of checks) lines.push(statLine(icon, label, state))
    lines.push(
      '',
      '<b>Интеграции с внешними фан-площадками</b>',
      '▸ Fanvue · TikTok · Instagram · Threads — коннекторы не реализованы;',
      'синхронизация инбокса выполняется вручную в консоли. Здесь ничего не притворяется обратным.',
      '',
      `<i>Проверено ${formatDate(new Date(now()).toISOString())} · живые запросы, без кэша.</i>`,
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
        error instanceof Error ? error.message : 'неизвестная ошибка')
      return { row: null, missing: true }
    }
  }

  const MISSING_NOTIFICATIONS_TABLE_TEXT = [
    ...screenTitle('🔧', 'Настройки'),
    'Настройкам уведомлений нужна миграция базы <b>0005</b>',
    '(supabase/migrations/0005_telegram_notifications.sql).',
    'Примените её в SQL-редакторе Supabase, затем откройте /settings заново.',
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
      ...screenTitle('🔧', 'Настройки'),
      statLine('🔗', 'Привязка аккаунта', 'активна (этот чат)'),
      '',
      '<b>Уведомления в Telegram</b>',
      statLine('🔔', 'Дайджест', settings.enabled ? 'включён (по подписке)' : 'выключен (по умолчанию)'),
    ]
    const toggles = []
    for (const [field, label] of NOTIFICATION_KINDS) {
      const on = Boolean(settings[field])
      lines.push(`  ${on ? '✅' : '◻️'} ${label}`)
      toggles.push({ text: `${on ? '✅' : '◻️'} ${label.replace(/^[^\s]+\s/, '')}`, callback_data: `ntf:${field}` })
    }
    lines.push(
      '',
      '<i>Дайджест отправляет задача notify (scripts/telegram-notify.mjs) и только',
      'когда с прошлой отправки что-то изменилось. Пока выключено — ничего не приходит.</i>',
    )
    const markup = {
      inline_keyboard: [
        [{ text: settings.enabled ? '🔕 Выключить дайджест' : '🔔 Включить дайджест', callback_data: 'ntf:master' }],
        toggles.slice(0, 3),
        toggles.slice(3),
        [
          { text: '⛓ Отключить…', callback_data: 'unlink' },
          { text: '🏠 Меню', callback_data: 'menu' },
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
    const titles = new Map((Array.isArray(convs) ? convs : []).map((c) => [c.id, c.subject || 'Диалог']))
    return rows.map((row) => ({ ...row, conversation: titles.get(row.conversation_id) ?? 'Диалог' }))
  }

  async function buildDraftsScreen(chatId, excludeIds = new Set()) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const all = await pendingDrafts(userId)
    const drafts = all.filter((d) => !excludeIds.has(d.id))
    const lines = [
      ...screenTitle('🕐', 'Черновики AI ждут вашего решения'),
      statLine('🗂', 'В очереди', String(drafts.length)),
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
        { text: `✅ Одобрить «${truncateText(draft.conversation, 14)}»`, callback_data: `dra${key}` },
        { text: '🗑 Отклонить', callback_data: `drx${key}` },
      ])
    }
    if (drafts.length > 5) lines.push(`<i>…и ещё ${drafts.length - 5} — после этих пяти.</i>`, '')
    if (!drafts.length) lines.push('<b>Очередь пуста.</b> Новые черновики появятся после запусков AI.', '')
    lines.push('<i>«Одобрить» помечает черновик как approved — как кнопка в инбоксе консоли. Отправка фанам — отдельный шаг в консоли; бот не отправляет ничего.</i>')
    const markup = { inline_keyboard: [...rows, [{ text: '↻ Обновить', callback_data: 'drafts' }, { text: '🏠 Меню', callback_data: 'menu' }], ...cabinetRow('messages')] }
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
        ...screenTitle('🤖', 'AI-провайдер не настроен'),
        'У бота нет ключа AI, поэтому он не будет выдумывать ответ.',
        '',
        'Чтобы включить: задайте <b>AI_API_KEY</b> (и опционально AI_BASE_URL, AI_MODEL)',
        'в окружении сервиса бота — никогда не как переменную VITE_*.',
      ].join('\n'),
      markup: sectionKeyboard('ai'),
    }
  }

  function aiBudgetScreen() {
    return {
      text: [
        ...screenTitle('🤖', 'Лимит AI исчерпан'),
        `Лимит: ${AI_CALL_LIMIT.limit} ${pluralRu(AI_CALL_LIMIT.limit, ['вызов', 'вызова', 'вызовов'])} AI в час со стороны бота. Повторите позже;`,
        'AI-студия в консоли этим счётчиком не ограничена.',
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
          ...screenTitle('💡', 'Идеи контента'),
          escapeHtml(result.text.slice(0, 3200)),
          '',
          `<i>Сгенерировано ${escapeHtml(result.model)} · записано в AI runs. Доработайте и запланируйте в консоли.</i>`,
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '🔄 Сгенерировать заново', callback_data: 'ai:ideas' }, { text: '🤖 AI', callback_data: 'ai' }], ...cabinetRow('content')] },
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
          ...screenTitle('💡', 'Идеи контента'),
          'AI-провайдер не смог ответить в этот раз. Повторите через минуту.',
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '🔄 Повторить', callback_data: 'ai:ideas' }, { text: '🤖 AI', callback_data: 'ai' }]] },
      }
    }
  }

  const BRIEF_KINDS = [
    ['fans', '👥 Сводка по фана'],
    ['inbox', '💬 Сводка по инбоксу'],
    ['revenue', '💰 Сводка по выручке'],
  ]

  async function buildBriefMenuScreen(chatId) {
    const userId = await getLinkedUserId(chatId)
    if (!userId) return { text: unlinkedMessage(), markup: connectKeyboard() }
    const text = [
      ...screenTitle('📑', 'AI-сводки'),
      'Выберите живой срез для сводки. Цифры берутся из ваших таблиц;',
      'модель их только комментирует. Каждый вызов пишется в AI runs.',
      aiClient.isConfigured ? '' : '',
      aiClient.isConfigured
        ? `<i>Провайдер: ${escapeHtml(aiClient.providerLabel)}</i>`
        : '<i>Провайдер не настроен — вызовы сообщат об этом вместо подделки результата.</i>',
    ].join('\n')
    return {
      text,
      markup: {
        inline_keyboard: [
          BRIEF_KINDS.map(([kind, label]) => ({ text: label, callback_data: `ai:sum:${kind}` })),
          [{ text: '🤖 AI', callback_data: 'ai' }, { text: '🏠 Меню', callback_data: 'menu' }],
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
        period: 'текущий месяц',
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
          `<i>Источник: живые таблицы · ${escapeHtml(result.model)} · записано в AI runs.</i>`,
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '📑 Сводки', callback_data: 'ai:brief' }, { text: '🤖 AI', callback_data: 'ai' }, { text: '🏠 Меню', callback_data: 'menu' }]] },
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
          ...screenTitle('📑', 'AI-сводка'),
          'AI-провайдер не смог ответить в этот раз. Повторите через минуту.',
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '📑 Сводки', callback_data: 'ai:brief' }, { text: '🤖 AI', callback_data: 'ai' }]] },
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
        lines.push(`📋 <b>${fresh.length}</b> ${pluralRu(fresh.length, ['новая задача', 'новые задачи', 'новых задач'])}: ${escapeHtml(truncateText(fresh[0].title, 48))}${fresh.length > 1 ? '…' : ''}`)
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
      if (unread || pending) lines.push(`💬 Инбокс: <b>${unread}</b> непрочитанных · <b>${pending}</b> ${pluralRu(pending, ['черновик ждёт', 'черновика ждут', 'черновиков ждут'])} вашего решения`)
      advance('inbox', stamp)
    }
    if (settings.notify_ai) {
      const rows = await readUserRows('ai_runs', userId, 'agent,status,created_at', { ...since('ai', 'created_at'), limit: '100' })
      const runs = Array.isArray(rows) ? rows : []
      const failed = runs.filter((r) => r.status === 'error').length
      if (runs.length) lines.push(`🤖 AI: завершено <b>${runs.length}</b> ${pluralRu(runs.length, ['запуск', 'запуска', 'запусков'])}${failed ? ` · с ошибками <b>${failed}</b>` : ''}`)
      advance('ai', stamp)
    }
    if (settings.notify_automations) {
      const rows = await readUserRows('automation_runs', userId, 'status,finished_at,started_at', { ...since('automation', 'started_at'), limit: '50' })
      const errors = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'error')
      if (errors.length) lines.push(`⚙️ Автоматизации: <b>${errors.length}</b> ${pluralRu(errors.length, ['запуск', 'запуска', 'запусков'])} с ошибкой — смотрите консоль`)
      advance('automation', stamp)
    }
    if (settings.notify_metrics) {
      const rows = await readUserRows('revenue_events', userId, 'amount,occurred_at', { ...since('metrics', 'occurred_at'), limit: '200' })
      const events = Array.isArray(rows) ? rows : []
      if (events.length) {
        const total = events.reduce((s, r) => s + Number(r.amount || 0), 0)
        lines.push(`📈 Метрики: <b>${escapeHtml(formatMoney(total))}</b> по <b>${events.length}</b> ${pluralRu(events.length, ['событию', 'событиям', 'событиям'])} выручки`)
      }
      const fans = await readUserRows('fans', userId, 'joined_at', { ...since('metrics_fans', 'joined_at'), limit: '200' })
      const freshFans = Array.isArray(fans) ? fans.length : 0
      if (freshFans) lines.push(`👥 Аудитория: <b>${freshFans}</b> ${pluralRu(freshFans, ['новый фан', 'новых фана', 'новых фанов'])}`)
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
        '<b>🔔 ДАЙДЖЕСТ MARA OS</b>',
        RULE,
        '',
        ...lines,
        '',
        '<i>Дайджест по подписке · измените разделы или отключите в /settings.</i>',
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
          `<b>🖤 С возвращением${name}.</b>`,
          '<i>Mara OS — операционная система за персоной — онлайн.</i>',
          RULE,
          '',
          '👥 статистика аудитории · 💬 разбор инбокса · 🎬 конвейер контента',
          '📊 выручка · ✅ задачи · 🤖 запуски AI',
          '',
          '<i>Кнопки ниже переключают разделы на месте — без захламления чата.</i>',
        ]
      : [
          `<b>🖤 Привет${name}.</b>`,
          '<i>Mara OS Assistant — ваша консоль креатора в этом чате.</i>',
          RULE,
          '',
          'Фаны по уровням отношений, непрочитанный инбокс, календарь контента,',
          'выручка и запуски AI-агентов — прямо из вашего аккаунта.',
          '',
          '<i>Привяжите аккаунт кнопкой ниже — это займёт меньше минуты.</i>',
        ]
    const text = intro.join('\n')
    return sendMessage(chatId, text, { reply_markup: mainKeyboard(Boolean(userId)) })
  }

  async function createLink(chatId, telegramUserId, displayName = '') {
    if (await getLinkedUserId(chatId)) {
      return sendMessage(chatId, [
        '<b>🔗 УЖЕ ПОДКЛЮЧЕНО</b>',
        RULE,
        '',
        'Этот чат в Telegram привязан к аккаунту Mara OS. Чтобы сменить',
        'аккаунт, сначала отключитесь через /unlink.',
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
      '<b>🔗 КОД ПРИВЯЗКИ</b>',
      RULE,
      '',
      `<b><code>${formatted}</code></b>`,
      '',
      '1️⃣ Откройте консоль → Настройки → Telegram',
      '2️⃣ Введите код из этого сообщения',
      '3️⃣ Статистика и сводки появятся прямо здесь',
      '',
      '<i>⏱ Одноразовый код · действует 10 минут</i>',
      '<i>Никому не сообщайте этот код — это ключ к вашему аккаунту.</i>',
    ].join('\n')
    const openBotSection = cabinetRow('telegram', '📱 Ввести код в консоли')
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
              '<b>✅ ДОСТУП ОТОЗВАН</b>',
              RULE,
              '',
              'Привязка удалена: бот больше не видит данные вашего аккаунта.',
              '',
              '<i>Подключиться заново можно в любой момент — /link.</i>',
            ].join('\n'),
            markup: connectKeyboard(),
          }
        : {
            text: [
              '<b>⛓ НЕ ПОДКЛЮЧЕНО</b>',
              RULE,
              '',
              'Этот Telegram и так не был привязан к аккаунту.',
              '',
              '<i>Чтобы подключиться — /link или кнопка ниже.</i>',
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
      let note = 'Этот черновик уже обработан в другом месте.'
      if (conversationId && messageId) {
        try {
          const result = await resolveDraft(chatId, conversationId, messageId, decision)
          if (result.decision === 'approve') note = 'Черновик одобрен — счётчик синхронизирован. Отправка остаётся шагом в консоли.'
          else if (result.decision === 'dismiss') note = 'Черновик отклонён и удалён.'
        } catch (error) {
          logger.error?.('[drafts] decision failed:', error instanceof Error ? error.message : 'unknown error')
          note = 'Не удалось применить решение — повторите попытку.'
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
      '<b>🤖 НЕ РАЗОБРАЛ СООБЩЕНИЕ</b>',
      RULE,
      '',
      'Используйте кнопки меню, команды (/help) или слова:',
      '<b>фан</b> · <b>инбокс</b> · <b>контент</b> · <b>эпизоды</b> · <b>выручка</b> · <b>задачи</b>',
      '<b>ai</b> · <b>автоматизации</b> · <b>статус</b> · <b>настройки</b> · <b>меню</b>.',
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
