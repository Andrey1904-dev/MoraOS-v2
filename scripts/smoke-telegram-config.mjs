/**
 * Smoke-тест настроек и ошибок раздела «Бот» (src/lib/telegram.ts).
 *
 * Ловит регрессию, из-за которой пользователь видел «Не удалось связаться
 * с ботом (405)»: в VITE_TELEGRAM_API_URL оказалось значение не-URL,
 * запрос уходил на домен самого сайта (GitHub Pages) и получал 404/405.
 *
 * Модуль собирается esbuild-ом с разными import.meta.env, затем проверяются
 * распознавание конфигурации и текст ошибок.
 *
 * Запуск: node scripts/smoke-telegram-config.mjs
 */
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const tmpDir = path.join(root, 'node_modules', '.tmp')
fs.mkdirSync(tmpDir, { recursive: true })

// Фиктивный токен нужного формата (НЕ настоящий): проверяем, что «токен» в переменной URL распознаётся как ошибка.
const TOKEN = '1234567890:AAFakeTokenForSmokeTests_0123456789'
const FUNCTION_URL = 'https://dcgurmwvpgzmlfivxoso.supabase.co/functions/v1/telegram-api'

let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`OK   ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function loadTelegramModule(env, index) {
  const outfile = path.join(tmpDir, `telegram-config-${index}.mjs`)
  await build({
    entryPoints: [path.join(root, 'src', 'lib', 'telegram.ts')],
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    outfile,
    logLevel: 'error',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, ...env }) },
  })
  return import(`${pathToFileURL(outfile).href}?v=${index}-${Date.now()}`)
}

/* ------------------------------------------------ распознавание настроек --- */

const cases = [
  {
    name: 'вместо адреса API подставлено произвольное значение',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: TOKEN },
    expect: { configured: false, issue: 'invalid-url' },
  },
  {
    name: 'относительный путь /telegram-api в задеплоенной сборке',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: '/telegram-api' },
    expect: { configured: false, issue: 'relative-in-prod' },
  },
  {
    name: 'корректный HTTPS-адрес функции',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: `${FUNCTION_URL}/` },
    expect: { configured: true, issue: '' },
  },
  {
    name: 'адрес без имени бота',
    env: { VITE_TELEGRAM_BOT_USERNAME: '', VITE_TELEGRAM_API_URL: FUNCTION_URL },
    expect: { configured: false, issue: 'missing-username' },
  },
  {
    name: 'адрес API не задан',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: '' },
    expect: { configured: false, issue: 'missing-url' },
  },
  {
    name: 'HTTP-адрес вместо HTTPS',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: 'http://bot.example.com' },
    expect: { configured: false, issue: 'not-https' },
  },
  {
    name: 'мусор в переменной',
    env: { VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: 'https://' },
    expect: { configured: false, issue: 'invalid-url' },
  },
]

const modules = {}
for (const [index, testCase] of cases.entries()) {
  const mod = await loadTelegramModule(testCase.env, index)
  modules[testCase.name] = mod
  check(
    testCase.name,
    mod.isTelegramConfigured === testCase.expect.configured && mod.TELEGRAM_CONFIG_ISSUE === testCase.expect.issue,
    `configured=${mod.isTelegramConfigured} issue="${mod.TELEGRAM_CONFIG_ISSUE}"`,
  )
}

check(
  'сообщение об ошибке называет переменную и ожидаемый формат',
  /VITE_TELEGRAM_API_URL/.test(modules['вместо адреса API подставлено произвольное значение'].TELEGRAM_CONFIG_MESSAGE) &&
    /https:\/\//.test(modules['вместо адреса API подставлено произвольное значение'].TELEGRAM_CONFIG_MESSAGE),
  modules['вместо адреса API подставлено произвольное значение'].TELEGRAM_CONFIG_MESSAGE,
)

const good = modules['корректный HTTPS-адрес функции']
check('TELEGRAM_API_URL нормализован без завершающего слэша', good.TELEGRAM_API_URL === FUNCTION_URL, good.TELEGRAM_API_URL)
check('домен API доступен для сообщений об ошибках', good.TELEGRAM_API_HOST === 'dcgurmwvpgzmlfivxoso.supabase.co', good.TELEGRAM_API_HOST)

/* -------------------------------------------- dev-режим и текст ошибок --- */

{
  const dev = await loadTelegramModule(
    { DEV: true, VITE_TELEGRAM_BOT_USERNAME: 'MaraOSAssistant_bot', VITE_TELEGRAM_API_URL: '/telegram-api' },
    100,
  )
  check('в dev-режиме относительный путь допустим (прокси Vite)', dev.isTelegramConfigured === true && dev.TELEGRAM_CONFIG_ISSUE === '')
}

globalThis.fetch = async () => new Response('<!DOCTYPE html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } })
try {
  await good.checkTelegramHealth()
  check('404 от статического сайта превращается в понятную ошибку', false, 'исключение не выброшено')
} catch (error) {
  const message = String(error.message)
  check(
    '404 от статического сайта превращается в понятную ошибку',
    message.includes('404') && message.includes('VITE_TELEGRAM_API_URL') && message.includes(good.TELEGRAM_API_HOST),
    message,
  )
}

globalThis.fetch = async () => new Response('Method Not Allowed', { status: 405, headers: { 'Content-Type': 'text/plain' } })
try {
  await good.requestTelegram('/api/telegram/link/confirm', 'token', { method: 'POST', body: { code: 'A4K9P72QX8' } })
  check('405 объясняет, что адрес ведёт на статический сайт', false, 'исключение не выброшено')
} catch (error) {
  const message = String(error.message)
  check(
    '405 объясняет, что адрес ведёт на статический сайт',
    message.includes('405') && message.includes('static') && message.includes('VITE_TELEGRAM_API_URL'),
    message,
  )
}

globalThis.fetch = async () =>
  new Response(JSON.stringify({ error: 'Code is invalid or expired. Request a new one with /link.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
try {
  await good.requestTelegram('/api/telegram/link/confirm', 'token', { method: 'POST', body: { code: 'AAAAAAAAAA' } })
  check('текст ошибки сервера показывается как есть', false, 'исключение не выброшено')
} catch (error) {
  check('текст ошибки сервера показывается как есть', String(error.message).includes('Code is invalid or expired'), String(error.message))
}

globalThis.fetch = async () => new Response('Unauthorized', { status: 401 })
try {
  await good.requestTelegram('/api/telegram/link/status', 'expired-token')
  check('401 подсказывает войти заново', false, 'исключение не выброшено')
} catch (error) {
  check('401 подсказывает войти заново', /Sign in again/.test(String(error.message)), String(error.message))
}

console.log(failed === 0 ? '\nTelegram config smoke: все проверки пройдены.' : `\nTelegram config smoke: провалено проверок — ${failed}.`)
process.exit(failed === 0 ? 0 : 1)
