#!/usr/bin/env node
/**
 * Настройка Supabase Auth из терминала (Management API).
 *
 * Зачем: встроенный отправитель писем Supabase шлёт максимум 2 письма в час
 * на весь проект и только на адреса участников команды. Поэтому регистрация
 * обычных ящиков (mail.ru, yandex.ru, gmail.com) падает с ошибками
 * «email rate limit exceeded» / «Email address not authorized».
 *
 * Лечится двумя способами — оба доступны этим скриптом:
 *   1) выключить подтверждение email  →  npm run supabase:auth -- --no-confirm
 *   2) подключить свой SMTP           →  npm run supabase:auth -- --smtp ...
 *
 * Токен доступа: https://supabase.com/dashboard/account/tokens  (строка sbp_…)
 *   export SUPABASE_ACCESS_TOKEN=sbp_xxx
 *
 * Примеры:
 *   npm run supabase:auth                        # показать текущие настройки
 *   npm run supabase:auth -- --no-confirm        # регистрация без писем (сразу работает)
 *   npm run supabase:auth -- --confirm           # вернуть подтверждение email
 *   npm run supabase:auth -- --site-url https://andrey1904-dev.github.io/MoraOS-v2/
 *   SMTP_PASS=re_xxx npm run supabase:auth -- --smtp \
 *     --smtp-host smtp.resend.com --smtp-port 465 \
 *     --smtp-user resend \
 *     --smtp-from no-reply@example.com --smtp-name "Mara OS" --rate-limit 100
 *   npm run supabase:auth -- --disable-signup    # после создания аккаунта владельца
 *
 * Пароль SMTP передаётся только через переменную SMTP_PASS (не аргументом).
 * Каждое применение также ставит минимальную длину пароля 8 символов.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com/v1' // подменяется в тестах
const DEFAULT_REF = 'dcgurmwvpgzmlfivxoso' // проект из README / workflow

/* ------------------------------ аргументы ------------------------------ */

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`)
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : fallback
}

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

if (flag('help') || flag('h')) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^#!.*\n/, ''))
  process.exit(0)
}

/* ---------------------- project ref и токен доступа --------------------- */

function readEnvUrl() {
  for (const file of ['.env', '.env.local']) {
    const p = resolve(ROOT, file)
    if (!existsSync(p)) continue
    const m = /^VITE_SUPABASE_URL\s*=\s*(.+)$/m.exec(readFileSync(p, 'utf8'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function projectRef() {
  const explicit = opt('project') ?? process.env.SUPABASE_PROJECT_REF
  if (explicit) return explicit.replace(/^https:\/\//, '').split('.')[0]
  const url = readEnvUrl()
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(url)
  return m ? m[1] : DEFAULT_REF
}

const REF = projectRef()
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!TOKEN) {
  console.error(red('Не задан SUPABASE_ACCESS_TOKEN.'))
  console.error(`
Как получить (30 секунд, токен личный — не коммитьте его):
  1. Откройте ${bold('https://supabase.com/dashboard/account/tokens')}
  2. Generate new token → скопируйте строку вида sbp_…
  3. Запустите команду так:

     ${bold('SUPABASE_ACCESS_TOKEN=sbp_xxx npm run supabase:auth -- --no-confirm')}

Проект: ${REF} (переопределить: --project <ref>)`)
  process.exit(1)
}

/* ------------------------------ API-вызовы ------------------------------ */

async function api(method, body) {
  const res = await fetch(`${API}/projects/${REF}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(red(`Supabase API ${res.status}: ${text}`))
    if (res.status === 401) console.error('Токен недействителен или истёк — сгенерируйте новый.')
    if (res.status === 404) console.error(`Проект «${REF}» не найден или токен от другого аккаунта.`)
    process.exit(1)
  }
  return text ? JSON.parse(text) : {}
}

function printStatus(cfg) {
  const smtpOn = Boolean(cfg.smtp_host)
  const confirm = cfg.mailer_autoconfirm === false
  console.log(`\n${bold('Проект:')} ${REF}`)
  console.log(`${bold('Site URL:')} ${cfg.site_url || '—'}`)
  console.log(
    `${bold('Подтверждение email:')} ${
      confirm ? yellow('включено (письма обязательны)') : green('выключено (регистрация сразу)')
    }`,
  )
  console.log(
    `${bold('SMTP:')} ${
      smtpOn ? green(`свой — ${cfg.smtp_host}:${cfg.smtp_port} (${cfg.smtp_admin_email || '—'})`) : yellow('встроенный Supabase — 2 письма/час, только адреса команды')
    }`,
  )
  console.log(`${bold('Лимит писем в час:')} ${cfg.rate_limit_email_sent ?? '—'}`)
  console.log(
    `${bold('Вход без подтверждения:')} ${
      cfg.mailer_allow_unverified_email_sign_ins ? green('разрешён') : 'запрещён'
    }`,
  )
  console.log(`${bold('Регистрация:')} ${cfg.disable_signup ? green('запрещена') : yellow('разрешена (закройте после создания владельца)')}`)
  console.log(`${bold('Мин. длина пароля:')} ${cfg.password_min_length ?? '—'}`)

  if (confirm && !smtpOn) {
    console.log(
      yellow(`
⚠ Текущая конфигурация ломает регистрацию посторонних адресов (в том числе .ru):
  письмо-подтверждение обязательно, а встроенный отправитель его не доставит.
  Быстрое решение:  npm run supabase:auth -- --no-confirm
  Правильное:       npm run supabase:auth -- --smtp --smtp-host … (см. --help)`),
    )
  }
}

/* -------------------------------- сценарии ------------------------------ */

const patch = {}

if (flag('no-confirm')) {
  patch.mailer_autoconfirm = true
  // важно: те, кто уже зарегистрировался и не получил письмо, иначе навсегда
  // останутся с неподтверждённым адресом и не смогут войти
  patch.mailer_allow_unverified_email_sign_ins = true
}
if (flag('confirm')) {
  patch.mailer_autoconfirm = false
  patch.mailer_allow_unverified_email_sign_ins = false
}
if (flag('allow-signup')) patch.disable_signup = false
// --disable-signup: закройте регистрацию, когда владелец уже создан (см. docs/setup.md).
if (flag('disable-signup')) patch.disable_signup = true
// Минимальная длина пароля — та же, что проверяет приложение (src/lib/authErrors.ts, AuthPage).
const MIN_PASSWORD_LENGTH = 8

const siteUrl = opt('site-url')
if (siteUrl) patch.site_url = siteUrl

const rateLimit = opt('rate-limit')
if (rateLimit) patch.rate_limit_email_sent = Number(rateLimit)

if (flag('smtp')) {
  const host = opt('smtp-host')
  const port = opt('smtp-port', '587')
  const user = opt('smtp-user')
  // Пароль SMTP — только из окружения: аргумент командной строки попадает в историю shell
  // и в список процессов, поэтому флаг --smtp-pass намеренно отвергается.
  if (opt('smtp-pass') !== undefined || argv.some((a) => a.startsWith('--smtp-pass='))) {
    console.error(red('--smtp-pass больше не принимается. Задайте пароль в переменной окружения SMTP_PASS.'))
    process.exit(1)
  }
  const pass = process.env.SMTP_PASS ?? ''
  const from = opt('smtp-from')
  const name = opt('smtp-name', 'Mara OS')
  const missing = [
    ['--smtp-host', host],
    ['--smtp-user', user],
    ['SMTP_PASS (переменная окружения)', pass],
    ['--smtp-from', from],
  ].filter(([, v]) => !v)
  if (missing.length) {
    console.error(red(`Для --smtp не хватает: ${missing.map(([k]) => k).join(', ')}`))
    process.exit(1)
  }
  Object.assign(patch, {
    external_email_enabled: true,
    smtp_host: host,
    smtp_port: String(port),
    smtp_user: user,
    smtp_pass: pass,
    smtp_admin_email: from,
    smtp_sender_name: name,
    rate_limit_email_sent: Number(rateLimit ?? 100),
  })
}

const before = await api('GET')

if (Object.keys(patch).length > 0) patch.password_min_length = MIN_PASSWORD_LENGTH

if (Object.keys(patch).length === 0) {
  printStatus(before)
  console.log(`
Что можно сделать:
  --no-confirm                выключить подтверждение email (регистрация любых адресов сразу)
  --confirm                   включить подтверждение обратно
  --smtp --smtp-host …        подключить свой SMTP (письма на любые адреса, включая .ru)
  --site-url <url>            куда вести ссылки из писем
  --rate-limit <N>            писем в час (работает только со своим SMTP)
  --help                      подробная справка`)
  process.exit(0)
}

const shown = { ...patch }
if (shown.smtp_pass) shown.smtp_pass = '***'
// (значения секретов в выводе маскируются)
console.log(`${bold('Применяю к проекту')} ${REF}:`, shown)

const after = await api('PATCH', patch)
console.log(green('\n✓ Настройки сохранены'))
printStatus(after)

if (patch.mailer_autoconfirm === true) {
  console.log(
    green(`
Готово: подтверждение email выключено. Теперь регистрация на любую почту
(mail.ru, yandex.ru, bk.ru, gmail.com …) проходит мгновенно и без писем,
ошибка «email rate limit exceeded» больше не появится.
Заодно разрешён вход тем, кто уже зарегистрировался, но письма не дождался.`),
  )
}
