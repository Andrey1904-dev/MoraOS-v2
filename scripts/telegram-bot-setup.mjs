/**
 * Настройка Telegram-бота Mara OS Assistant для Supabase Edge Function.
 *
 * Что делает скрипт:
 *   1. (по желанию, --deploy) разворачивает функцию telegram-api и секреты через Supabase CLI;
 *   2. ставит webhook Telegram на адрес функции со случайным секретом;
 *   3. обновляет описание и команды бота;
 *   4. ставит кнопку меню типа `web_app` (Telegram Mini App) на WEB_APP_URL
 *      и проверяет итог через getChatMenuButton;
 *   5. проверяет GET /health и печатает переменные для GitHub Actions.
 *
 * Адрес Mini App берётся только из конфигурации: WEB_APP_URL (или --webapp-url).
 * Нужен публичный HTTPS-адрес опубликованного сайта, например
 *   WEB_APP_URL=https://andrey1904-dev.github.io/MoraOS-v2/
 *
 * Пример:
 *   TELEGRAM_BOT_TOKEN=123:AA... SUPABASE_ACCESS_TOKEN=sbp_... \
 *     node scripts/telegram-bot-setup.mjs --deploy
 *
 * Без --deploy скрипт только настраивает уже развёрнутую функцию:
 *   TELEGRAM_BOT_TOKEN=123:AA... WEB_APP_URL=https://… node scripts/telegram-bot-setup.mjs
 *
 * Только кнопка меню Mini App (без webhook, описаний и команд):
 *   TELEGRAM_BOT_TOKEN=… WEB_APP_URL=https://… node scripts/telegram-bot-setup.mjs --menu-only
 *
 * Токен бота передавайте только через переменные окружения: в браузерную
 * сборку (VITE_*) он попадать не должен.
 */
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from '../bot/core.mjs'
import { miniAppMenuButton, normalizeMiniAppUrl } from '../bot/format.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/**
 * Версия Supabase CLI, которой деплоится функция. Закреплена, чтобы результат
 * деплоя не менялся при выходе новой версии CLI (обновляйте осознанно).
 */
export const SUPABASE_CLI = 'supabase@2.120.0'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

// Ref проекта: флаг → SUPABASE_PROJECT_REF → домен из SUPABASE_URL. supabase/config.toml
// здесь не используется: там имя локального проекта, а не ref облачного.
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const projectRef =
  value('--project-ref') ||
  (process.env.SUPABASE_PROJECT_REF ?? '').trim() ||
  (process.env.SUPABASE_URL ?? '').trim().match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1] ||
  ''
if (projectRef && !PROJECT_REF_PATTERN.test(projectRef)) {
  console.error('Некорректный ref проекта Supabase: ожидаются 20 символов a-z0-9 (Settings → General → Reference ID).')
  process.exit(1)
}

const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
const rawWebAppUrl = (value('--webapp-url') || process.env.WEB_APP_URL || '').trim()
const webAppUrl = normalizeMiniAppUrl(rawWebAppUrl)
const menuOnly = flag('--menu-only')
const functionUrl = (value('--api-url') || process.env.TELEGRAM_API_URL || (projectRef ? `https://${projectRef}.supabase.co/functions/v1/telegram-api` : '')).replace(/\/+$/, '')
// Секрет вебхука задаётся только через окружение: аргумент командной строки виден в списке процессов.
// При --deploy генерируется новый, если не задан; без --deploy он обязан совпадать с секретом функции.
const providedWebhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
const deploy = flag('--deploy') && !menuOnly
const webhookSecret = providedWebhookSecret || (deploy ? randomBytes(24).toString('hex') : '')

if (!botToken || !/^\d{6,12}:[A-Za-z0-9_-]{25,}$/.test(botToken)) {
  console.error('Не задан TELEGRAM_BOT_TOKEN (ожидается токен из @BotFather).')
  process.exit(1)
}
if (!webAppUrl) {
  console.error(
    rawWebAppUrl
      ? 'WEB_APP_URL должен быть публичным HTTPS-адресом сайта (не localhost, без логина/пароля в URL).'
      : 'Не задан WEB_APP_URL (или --webapp-url): укажите публичный HTTPS-адрес сайта для Telegram Mini App.',
  )
  process.exit(1)
}
if (!menuOnly && !functionUrl.startsWith('https://')) {
  console.error('Нужен публичный HTTPS-адрес функции: укажите --api-url, SUPABASE_PROJECT_REF или SUPABASE_URL.')
  process.exit(1)
}
if (!menuOnly && !webhookSecret) {
  console.error('Не задан TELEGRAM_WEBHOOK_SECRET: укажите тот же секрет, что записан у функции (или запустите с --deploy).')
  process.exit(1)
}

/** Значения секретов в логах команд заменяются на «***». */
const maskSecrets = (text) =>
  [botToken, webhookSecret].filter(Boolean).reduce((acc, secret) => acc.split(secret).join('***'), text)

const api = async (method, payload = {}, timeoutMs = 20_000) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    throw new Error(maskSecrets(`Telegram ${method}: ${data?.description ?? `HTTP ${response.status}`}`))
  }
  return data.result
}

const run = (command, commandArgs, env = {}) => {
  console.log(maskSecrets(`$ ${command} ${commandArgs.join(' ')}`))
  execFileSync(command, commandArgs, { stdio: 'inherit', cwd: root, env: { ...process.env, ...env } })
}

if (deploy) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error('Для --deploy нужен SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).')
    process.exit(1)
  }
  if (!projectRef) {
    console.error('Для --deploy нужен ref проекта: --project-ref, SUPABASE_PROJECT_REF или SUPABASE_URL.')
    process.exit(1)
  }
  // Секреты передаются файлом (--env-file), а не аргументами: значения не попадают в argv.
  // Файл создаётся с правами 0600 в отдельном каталоге и удаляется сразу после загрузки.
  const secretsDir = mkdtempSync(path.join(tmpdir(), 'mara-os-secrets-'))
  const envFile = path.join(secretsDir, 'secrets.env')
  try {
    writeFileSync(
      envFile,
      `TELEGRAM_BOT_TOKEN=${botToken}\nTELEGRAM_WEBHOOK_SECRET=${webhookSecret}\nWEB_APP_URL=${webAppUrl}\n`,
      { mode: 0o600 },
    )
    run('npx', ['--yes', SUPABASE_CLI, 'secrets', 'set', '--env-file', envFile, '--project-ref', projectRef])
  } finally {
    rmSync(secretsDir, { recursive: true, force: true })
  }
  run('npx', ['--yes', SUPABASE_CLI, 'functions', 'deploy', 'telegram-api', '--project-ref', projectRef])
}

const bot = await api('getMe')
console.log(`\nБот: @${bot.username}`)

/** Кнопка меню → Telegram Mini App. Команды бота при этом не удаляются. */
async function applyMenuButton() {
  const menuButton = miniAppMenuButton(webAppUrl)
  if (menuButton.type !== 'web_app') throw new Error('Некорректный WEB_APP_URL для кнопки меню.')
  await api('setChatMenuButton', { menu_button: menuButton })
  const actual = await api('getChatMenuButton', {})
  if (actual?.type !== 'web_app' || actual?.web_app?.url !== menuButton.web_app.url) {
    throw new Error(`Кнопка меню не применилась: Telegram вернул ${JSON.stringify(actual)}`)
  }
  console.log(`Кнопка меню: «${actual.text}» → Mini App ${actual.web_app.url}`)
}

if (menuOnly) {
  await applyMenuButton()
  console.log('\nГотово: обновлена только кнопка меню Mini App.')
  process.exit(0)
}

await api('setMyDescription', { description: BOT_DESCRIPTION })
await api('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION })
await api('setMyCommands', { commands: BOT_COMMANDS })
await applyMenuButton()
await api('setWebhook', {
  url: functionUrl,
  secret_token: webhookSecret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
})
console.log(`Webhook: ${functionUrl}`)

const info = await api('getWebhookInfo')
if (info.last_error_message) console.warn(maskSecrets(`Внимание, Telegram сообщает об ошибке вебхука: ${info.last_error_message}`))

try {
  const response = await fetch(`${functionUrl}/health`, { headers: { 'Cache-Control': 'no-cache' } })
  const health = await response.json().catch(() => null)
  console.log(`Health: ${response.status} ${JSON.stringify(health)}`)
  if (!response.ok) {
    console.warn('Функция отвечает не 200: проверьте секреты TELEGRAM_BOT_TOKEN и развёртывание telegram-api.')
  }
} catch (error) {
  console.warn(`Не удалось проверить ${functionUrl}/health: ${error instanceof Error ? error.message : error}`)
}

console.log(`
Готово. Проверьте переменные репозитория GitHub:
  Settings → Secrets and variables → Actions → Variables
    VITE_TELEGRAM_BOT_USERNAME = ${bot.username}
    VITE_TELEGRAM_API_URL      = ${functionUrl}

Mini App: кнопка меню и inline-кнопки бота открывают ${webAppUrl}
Прямая ссылка (запуск из других чатов) требует регистрации Main Mini App в @BotFather:
  https://t.me/${bot.username}?startapp=fans

Токен бота храните только в секретах (Supabase secrets / bot/.env / CI), не в VITE_*.
Если токен когда-либо попадал в VITE_* или в сборку сайта — отзовите его командой /revoke в @BotFather,
затем снова запустите этот скрипт.
`)
