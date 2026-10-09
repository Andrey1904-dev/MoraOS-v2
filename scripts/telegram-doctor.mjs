/**
 * Диагностика молчащего Telegram-бота Mara OS (webhook-транспорт, Edge Function).
 *
 * Отвечает на вопрос «почему бот не реагирует на /start», ничего не меняя:
 * ни setWebhook, ни deleteWebhook, ни сообщений в чат. Только чтение Telegram API
 * и два безобидных POST на саму функцию (пустой update без message/callback_query —
 * обработчик вернёт 200 и ничего не отправит).
 *
 * Проверяемая цепочка доставки /start:
 *   токен → webhook (установлен? свежие ошибки?) → функция (/health) → секрет вебхука (проба).
 *
 * Запуск (нужен доступ в интернет с рабочей машины):
 *   TELEGRAM_BOT_TOKEN=… node scripts/telegram-doctor.mjs
 *   node --env-file=bot/.env scripts/telegram-doctor.mjs
 *
 * Опционально:
 *   TELEGRAM_WEBHOOK_SECRET — проба вебхука: подтверждает или опровергает совпадение
 *                             секрета функции (частая «тихая» причина молчания);
 *   TELEGRAM_API_URL        — адрес функции, если webhook ещё не установлен
 *                             (иначе он берётся из getWebhookInfo).
 *
 * Вывод: список находок (✓/✗/!) с конкретными командами исправления и итоговый вердикт.
 * Секреты в выводе маскируются. Логика вердиктов — чистая функция diagnose() (тесты:
 * tests/telegram.test.mjs), сетевой слой — только здесь.
 */
import { pathToFileURL } from 'node:url'

const RECENT_ERROR_WINDOW_MS = 15 * 60_000
const TELEGRAM_TIMEOUT_MS = 20_000
const FETCH_TIMEOUT_MS = 20_000

/* --------------------------------------------------------- сетевой слой --- */

async function telegramCall(token, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.description ?? `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return data.result
}

async function fetchStatus(url, { method = 'GET', headers = {}, body } = {}) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    await response.arrayBuffer().catch(() => undefined)
    return response.status
  } catch {
    return null
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  } catch (error) {
    return { status: null, body: null, error }
  }
}

/* ------------------------------------------------------------- вердикты --- */

/**
 * Чистая функция: собирает находки из фактов. Тестируется без сети.
 *
 * @param {object} [facts]
 * @param {{ username: string }} [facts.me]                 результат getMe
 * @param {object|null} [facts.webhookInfo]                 результат getWebhookInfo (или null — не удалось)
 * @param {{ status: number|null, body: object|null }} [facts.health]  GET {functionUrl}/health
 * @param {{ withSecret: number|null, withoutSecret: number|null }|null} [facts.probe]
 *        HTTP-статусы POST пустого update на функцию с секретом и без
 * @param {boolean} [facts.functionUrlKnown]                адрес функции был известен независимо от вебхука
 * @returns {{ findings: Array<{level: 'ok'|'fail'|'warn', title: string, detail?: string, fix?: string}>, ok: boolean }}
 */
export function diagnose({ me, webhookInfo, health, probe, functionUrlKnown = false } = {}) {
  const findings = []
  const add = (level, title, detail, fix) => findings.push({ level, title, ...(detail ? { detail } : {}), ...(fix ? { fix } : {}) })

  /* Шаг 1. Токен бота */
  if (!me) {
    add(
      'fail',
      'Токен не принят Telegram API',
      'getMe завершился ошибкой (401 — токен отозван или с опечаткой; прочее — сеть).',
      'Выпустите новый токен в @BotFather (/revoke → /token), обновите секрет TELEGRAM_BOT_TOKEN у функции и в GitHub Actions, затем повторите настройку.',
    )
  } else {
    add('ok', `Токен действует: @${me.username}`, undefined, undefined)
  }

  /* Шаг 2. Webhook — куда Telegram доставляет /start */
  const webhookUrl = String(webhookInfo?.url ?? '')
  if (!webhookInfo) {
    add('fail', 'Не удалось получить getWebhookInfo', 'Telegram API недоступен или токен не принят — шаги ниже могут быть неточны.')
  } else if (!webhookUrl) {
    add(
      'fail',
      'Webhook не установлен — /start некому доставлять',
      'Telegram не знает адреса функции, поэтому сообщения боту никуда не уходят. Это главная причина молчания нового бота.',
      'Установите webhook: Actions → «Telegram bot — Mini App setup» → Run workflow, mode: full (deploy: true — если функция ещё не развёрнута). Или локально: npm run bot:setup -- --deploy. Режим menu ставит только кнопку Mini App и webhook НЕ ставит.',
    )
  } else {
    if (!/\/functions\/v1\/telegram-api\/?$/.test(webhookUrl)) {
      add(
        'warn',
        'Webhook указывает на неожиданный адрес',
        webhookUrl,
        'Ожидается https://<ref>.supabase.co/functions/v1/telegram-api. Переустановите webhook командой npm run bot:setup.',
      )
    } else {
      add('ok', 'Webhook установлен', webhookUrl)
    }

    const pending = Number(webhookInfo?.pending_update_count ?? 0)
    if (pending > 0) {
      add('warn', `В очереди ${pending} недоставленных обновлений`, 'Telegram повторяет доставку — значит, функция не принимает обновления.')
    }

    const lastErrorAt = Number(webhookInfo?.last_error_date ?? 0) * 1000
    const lastError = String(webhookInfo?.last_error_message ?? '')
    if (lastError && lastErrorAt && Date.now() - lastErrorAt < RECENT_ERROR_WINDOW_MS) {
      const mapped = mapWebhookError(lastError)
      add(mapped.level, `Telegram сообщает об ошибке доставки: ${mapped.title}`, lastError, mapped.fix)
    } else if (lastError && lastErrorAt) {
      add('warn', 'Ранее была ошибка доставки (сейчас повторов нет)', lastError)
    }
  }

  /* Шаг 3. Функция: /health и сверка представления о webhook */
  if (health) {
    if (health.status === null) {
      add(
        'fail',
        'Функция недоступна',
        'Соединение с адресом функции не установлено: проект Supabase на паузе (free tier), удалён или адрес неверен.',
        'Разбудите/проверьте проект в дашборде Supabase и сверите адрес функции (Settings → API → Function URL).',
      )
    } else if (health.status === 200 && health.body?.ok) {
      add('ok', 'Функция отвечает: /health 200', `режим ${health.body?.mode ?? '?'}, бот ${health.body?.botPolling ?? '?'}`)
    } else if (health.body?.configured === false) {
      add(
        'fail',
        'У функции нет токена бота',
        '/health: configured=false — секрет TELEGRAM_BOT_TOKEN не задан для Edge Function.',
        'Задайте секреты функции: npm run bot:setup -- --deploy (заодно развернёт функцию) или supabase secrets set.',
      )
    } else if (String(health.body?.hint ?? '').includes('Webhook не настроен')) {
      if (webhookUrl) {
        add(
          'fail',
          'Токен функции и токен проверки — разные боты',
          'Ваш getWebhookInfo показывает webhook, а функция со своим токеном его не видит: TELEGRAM_BOT_TOKEN у функции принадлежит другому боту. /start уходит в того бота, у которого webhook есть, но функция не та.',
          'Запишите в секреты функции токен именно этого бота и повторите: npm run bot:setup -- --deploy.',
        )
      } else {
        add('fail', 'Функция подтверждает: webhook не установлен', undefined, 'npm run bot:setup -- --deploy.')
      }
    } else {
      add('warn', `Функция отвечает не 200 (/health → ${health.status})`, JSON.stringify(health.body?.hint ?? '').slice(0, 200))
    }
  } else if (webhookUrl) {
    add('warn', 'Проверка /health не выполнена', 'Адрес функции не передан (TELEGRAM_API_URL/SUPABASE_PROJECT_REF), а webhook пуст.')
  }

  /* Шаг 4. Проба вебхука: секрет совпадает и маршрут работает? */
  if (probe) {
    if (probe.withSecret === null && probe.withoutSecret === null) {
      add('warn', 'Проба вебхука не удалась', 'Функция не ответила на тестовый POST (пауза проекта или адрес недоступен).')
    } else {
      if (probe.withoutSecret === 403) {
        add('ok', 'Функция требует секрет вебхука (без заголовка — 403)')
      } else if (probe.withoutSecret !== null) {
        add(
          'warn',
          `POST без секрета вернул ${probe.withoutSecret}`,
          'Ожидался 403: возможно, по этому адресу отвечает не telegram-api (или чужой обработчик).',
        )
      }
      if (probe.withSecret === 200) {
        add('ok', 'Проба вебхука: секрет принят, маршрут работает')
      } else if (probe.withSecret !== null) {
        add(
          'fail',
          `Проба вебхука с секретом вернула ${probe.withSecret}`,
          'TELEGRAM_WEBHOOK_SECRET не совпадает с секретом функции (или функция не задеплоена) — Telegram получает то же самое и молча теряет /start.',
          'Перезапустите настройку с новым секретом: npm run bot:setup -- --deploy (секрет генерируется и ставится автоматически).',
        )
      }
    }
  } else if (functionUrlKnown) {
    add('warn', 'Проба вебхука пропущена', 'Не задан TELEGRAM_WEBHOOK_SECRET — совпадение секрета функции не проверено.')
  }

  return { findings, ok: findings.every((finding) => finding.level !== 'fail') }
}

/** Карта текстов ошибок доставки Telegram → причина и исправление. */
export function mapWebhookError(message) {
  const text = String(message)
  if (/403/.test(text)) {
    return {
      level: 'fail',
      title: 'секрет вебхука не совпадает (функция отвечает 403)',
      fix: 'Перезапустите настройку, чтобы секрет совпал: npm run bot:setup -- --deploy, или задайте одинаковый TELEGRAM_WEBHOOK_SECRET у функции и в webhook.',
    }
  }
  if (/40[145]/.test(text)) {
    return {
      level: 'fail',
      title: 'функция не найдена или отклоняет запрос (404/401/405)',
      fix: 'telegram-api не задеплоен в этот проект или verify_jwt включён. Разверните: npm run bot:setup -- --deploy (config.toml репозитория отключает verify_jwt).',
    }
  }
  if (/[45]0\d/.test(text)) {
    return {
      level: 'fail',
      title: 'функция падает при обработке (5xx)',
      fix: 'Смотрите логи: supabase functions logs telegram-api. Обычно не заданы секреты (TELEGRAM_BOT_TOKEN, ключи Supabase) или не применены миграции.',
    }
  }
  if (/timeout|connection|ssl|dns|resolve/i.test(text)) {
    return {
      level: 'fail',
      title: 'проект Supabase недоступен',
      fix: 'Проект на паузе (free tier) или удалён — разбудите его в дашборде Supabase.',
    }
  }
  return { level: 'warn', title: 'неизвестная ошибка доставки', fix: 'Смотрите логи функции: supabase functions logs telegram-api.' }
}

/* --------------------------------------------------------------- вывод --- */

const ICON = { ok: '✓', fail: '✗', warn: '!' }

function printFindings(findings, { mask = [] } = {}) {
  const clean = (text) => mask.reduce((acc, secret) => (secret ? acc.split(secret).join('***') : acc), String(text))
  for (const finding of findings) {
    console.log(`${ICON[finding.level]} ${clean(finding.title)}`)
    if (finding.detail) console.log(`    ${clean(finding.detail)}`)
    if (finding.fix) console.log(`    → ${clean(finding.fix)}`)
  }
}

function parseArgs(argv) {
  const args = new Set(argv)
  const value = (name) => {
    const index = argv.indexOf(name)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : ''
  }
  return { json: args.has('--json'), api: value('--api-url') }
}

/**
 * @param {object} [deps] — инъекция для тестов/окружений без сети
 */
export async function collectFacts({
  token,
  webhookSecret = '',
  functionUrl = '',
  telegramCallImpl = telegramCall,
  fetchJsonImpl = fetchJson,
  fetchStatusImpl = fetchStatus,
} = {}) {
  const me = await telegramCallImpl(token, 'getMe').then(
    (result) => ({ username: result.username }),
    () => null,
  )

  const webhookInfo = await telegramCallImpl(token, 'getWebhookInfo').catch(() => null)

  const urlFromWebhook = String(webhookInfo?.url ?? '')
  const resolvedUrl = (functionUrl || urlFromWebhook).replace(/\/+$/, '')
  const health = resolvedUrl ? await fetchJsonImpl(`${resolvedUrl}/health`) : null

  let probe = null
  if (webhookSecret && resolvedUrl) {
    const neutralUpdate = JSON.stringify({ update_id: 0 })
    const withSecret = await fetchStatusImpl(resolvedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret },
      body: neutralUpdate,
    })
    const withoutSecret = await fetchStatusImpl(resolvedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: neutralUpdate,
    })
    probe = { withSecret, withoutSecret }
  }

  return {
    me,
    webhookInfo,
    health,
    probe,
    functionUrlKnown: Boolean(functionUrl || urlFromWebhook),
    resolvedUrl,
  }
}

async function main() {
  const { json, api: apiUrl } = parseArgs(process.argv.slice(2))
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
  const ref = (process.env.SUPABASE_PROJECT_REF ?? '').trim()
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim()
  const functionUrl =
    (apiUrl || process.env.TELEGRAM_API_URL || '').trim() ||
    (ref ? `https://${ref}.supabase.co/functions/v1/telegram-api` : '') ||
    (supabaseUrl.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1]
      ? `https://${supabaseUrl.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)[1]}.supabase.co/functions/v1/telegram-api`
      : '')

  if (!token) {
    console.error('Не задан TELEGRAM_BOT_TOKEN. Пример: TELEGRAM_BOT_TOKEN=123456:… node scripts/telegram-doctor.mjs')
    process.exit(1)
  }

  const facts = await collectFacts({ token, webhookSecret, functionUrl })
  const { findings, ok } = diagnose(facts)

  if (json) {
    console.log(JSON.stringify({ ok, findings, ...facts, resolvedUrl: facts.resolvedUrl }, null, 2))
  } else {
    console.log('Диагностика доставки Telegram-бота (read-only, без изменений настроек)\n')

    printFindings(findings, { mask: [token, webhookSecret] })
    console.log('')
    if (ok) {
      console.log('ИТОГ: критичных проблем не найдено — отправьте /start боту ещё раз.')
      console.log('Если бот по-прежнему молчит: supabase functions logs telegram-api')
    } else {
      console.log('ИТОГ: найдены причины молчания — исправьте пункты с ✗ (команды в строках →).')
      console.log('Затем отправьте /start боту. Диагностику можно повторить в любой момент.')
    }
  }
  process.exitCode = ok ? 0 : 1
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) await main()
