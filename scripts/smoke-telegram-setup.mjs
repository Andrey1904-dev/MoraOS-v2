/**
 * Smoke-тест scripts/telegram-bot-setup.mjs (кнопка меню Telegram Mini App).
 *
 * Скрипт запускается как есть, но с подменённым fetch (scripts/mocks/…):
 * реальный токен и сеть не нужны. Проверяется, что:
 *   • кнопка меню ставится с type=web_app и URL из WEB_APP_URL и проверяется
 *     через getChatMenuButton;
 *   • команды бота не удаляются;
 *   • без WEB_APP_URL / с HTTP-адресом скрипт останавливается до вызовов API;
 *   • токен и секрет вебхука не попадают в вывод.
 *
 * Запуск: node scripts/smoke-telegram-setup.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const script = path.join(here, 'telegram-bot-setup.mjs')
const mock = path.join(here, 'mocks', 'telegram-fetch-mock.mjs')
const dir = mkdtempSync(path.join(tmpdir(), 'tg-setup-'))

// Фиктивные значения нужного формата — не настоящие секреты.
const TOKEN = '1234567890:SMOKE_fake_token_abcdefghijklmnopqrstuv'
const SECRET = 'smoke-webhook-secret-0123456789abcdef'
const SITE = 'https://andrey1904-dev.github.io/MoraOS-v2/'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

function runSetup(name, env, args = []) {
  const log = path.join(dir, `${name}.jsonl`)
  const result = spawnSync(process.execPath, ['--import', mock, script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SMOKE_TG_LOG: log,
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_WEBHOOK_SECRET: SECRET,
      TELEGRAM_API_URL: 'https://project.supabase.co/functions/v1/telegram-api',
      ...env,
    },
  })
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : []
  const output = `${result.stdout}\n${result.stderr}`
  return { status: result.status, output, calls }
}

/* ------------------------------------------------------- успешная настройка --- */
{
  const { status, output, calls } = runSetup('full', { WEB_APP_URL: `${SITE}#/telegram` })
  check('полная настройка завершается успешно', status === 0, output)
  const menu = calls.find((c) => c.method === 'setChatMenuButton')
  check(
    'setChatMenuButton: type=web_app, URL из WEB_APP_URL (без hash)',
    menu?.body?.menu_button?.type === 'web_app' && menu.body.menu_button.web_app?.url === SITE && Boolean(menu.body.menu_button.text),
    JSON.stringify(menu),
  )
  check('итог проверяется через getChatMenuButton', calls.some((c) => c.method === 'getChatMenuButton'))
  check('команды бота сохраняются (setMyCommands)', (calls.find((c) => c.method === 'setMyCommands')?.body?.commands ?? []).length >= 5)
  check('кнопка меню не сбрасывается на commands', !calls.some((c) => c.method === 'setChatMenuButton' && c.body?.menu_button?.type === 'commands'))
  check('токен не выводится в лог', !output.includes(TOKEN) && !output.includes(TOKEN.split(':')[1]))
  check('секрет вебхука не выводится в лог', !output.includes(SECRET))
}

/* ------------------------------------------------------------ --menu-only --- */
{
  const { status, output, calls } = runSetup('menu', { WEB_APP_URL: SITE }, ['--menu-only'])
  check('--menu-only: успешно', status === 0, output)
  const methods = calls.map((c) => c.method)
  check('--menu-only: трогает только getMe и кнопку меню', methods.join(',') === 'getMe,setChatMenuButton,getChatMenuButton', methods.join(','))
}

/* -------------------------------------------------------- ошибки конфигурации --- */
for (const [name, url] of [
  ['нет WEB_APP_URL', ''],
  ['HTTP вместо HTTPS', 'http://andrey1904-dev.github.io/MoraOS-v2/'],
  ['localhost', 'https://localhost:5173/'],
]) {
  const { status, output, calls } = runSetup(`bad-${name}`, { WEB_APP_URL: url })
  check(`${name}: скрипт останавливается до вызовов Bot API`, status !== 0 && calls.length === 0, `status=${status} calls=${calls.length}`)
  check(`${name}: понятное сообщение про WEB_APP_URL`, /WEB_APP_URL/.test(output), output)
}

/* ----------------------------------------------- Telegram не применил кнопку --- */
{
  const { status, output } = runSetup('ignored', { WEB_APP_URL: SITE, SMOKE_TG_IGNORE_MENU: '1' }, ['--menu-only'])
  check('расхождение getChatMenuButton считается ошибкой', status !== 0 && /не применилась/.test(output), output)
  check('в тексте ошибки нет токена', !output.includes(TOKEN))
}

/* ---------------------------------------- ref проекта и секреты (F2, F13) --- */
{
  // Без ref проекта, SUPABASE_URL и адреса функции скрипт не выходит в сеть и не падает молча.
  const { status, output, calls } = runSetup('no-ref', { WEB_APP_URL: SITE, TELEGRAM_API_URL: '', TELEGRAM_WEBHOOK_SECRET: SECRET, SUPABASE_URL: '' })
  check('без ref проекта: ошибка до вызовов Telegram API', status === 1 && calls.length === 0, output)
  check('без ref проекта: fallback на supabase/config.toml не происходит', !/ladagrantacredit/.test(output) && !calls.some((c) => /ladagrantacredit/.test(JSON.stringify(c))))
}
{
  // Секрет вебхука принимается только из окружения: аргумент --secret не используется.
  const { status, output, calls } = runSetup('secret-arg', { WEB_APP_URL: SITE, TELEGRAM_WEBHOOK_SECRET: '' }, ['--secret', 'argv-leak-value'])
  check('без TELEGRAM_WEBHOOK_SECRET (даже с --secret) скрипт останавливается до API', status === 1 && calls.length === 0, output)
  check('значение из аргумента не попадает в вывод', !output.includes('argv-leak-value'))
}
{
  // Ref из SUPABASE_PROJECT_REF задаёт адрес функции, когда TELEGRAM_API_URL не указан.
  const { status, output, calls } = runSetup('ref-env', { WEB_APP_URL: SITE, TELEGRAM_API_URL: '', SUPABASE_PROJECT_REF: 'dcgurmwvpgzmlfivxoso', TELEGRAM_WEBHOOK_SECRET: SECRET })
  const hook = calls.find((c) => c.method === 'setWebhook')
  check('ref из SUPABASE_PROJECT_REF формирует адрес функции', status === 0 && hook?.body?.url === 'https://dcgurmwvpgzmlfivxoso.supabase.co/functions/v1/telegram-api', output)
  check('некорректный ref отклоняется', runSetup('bad-ref', { WEB_APP_URL: SITE, SUPABASE_PROJECT_REF: 'LADA-bad' }).status === 1)
}

console.log(failed === 0 ? '\nTelegram setup smoke: все проверки пройдены.' : `\nTelegram setup smoke: провалено проверок — ${failed}.`)
process.exit(failed === 0 ? 0 : 1)
