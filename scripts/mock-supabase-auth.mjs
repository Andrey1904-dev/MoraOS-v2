#!/usr/bin/env node
/**
 * Мини-заглушка Supabase Auth для отладки экрана регистрации.
 *
 * Позволяет проверить поведение приложения при лимитах писем, НЕ расходуя
 * реальные 2 письма в час настоящего проекта Supabase.
 *
 * Запуск:
 *   node scripts/mock-supabase-auth.mjs --port 5174
 *   # затем в .env:
 *   # VITE_SUPABASE_URL=http://localhost:5174
 *   # VITE_SUPABASE_ANON_KEY=mock-anon-key
 *
 * Сценарий по умолчанию повторяет боевую конфигурацию, в которой ломается
 * регистрация: подтверждение email включено, встроенный отправитель писем
 * отдаёт 429 over_email_send_rate_limit после MAIL_QUOTA писем.
 *
 * Флаги:
 *   --port <n>        порт (по умолчанию 5174)
 *   --autoconfirm     подтверждение email выключено (регистрация без писем)
 *   --quota <n>       сколько писем «пройдёт» до лимита (по умолчанию 2)
 *   --not-authorized  всегда отвечать email_address_not_authorized
 */

import { createServer } from 'node:http'

const argv = process.argv.slice(2)
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const flag = (n) => argv.includes(`--${n}`)

const PORT = Number(opt('port', 5174))
const AUTOCONFIRM = flag('autoconfirm')
const QUOTA = Number(opt('quota', 2))

let mailsSent = 0
const users = new Map() // email -> { password, confirmed }

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': '*',
  })
  res.end(JSON.stringify(body))
}

const gotrueError = (res, status, errorCode, msg) =>
  json(res, status, { code: status, error_code: errorCode, msg })

const userObject = (email, confirmed) => ({
  id: `mock-${Buffer.from(email).toString('hex').slice(0, 12)}`,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  email_confirmed_at: confirmed ? new Date().toISOString() : null,
  confirmation_sent_at: confirmed ? null : new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [{ id: 'mock', user_id: 'mock', identity_data: { email }, provider: 'email' }],
})

const session = (email) => ({
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: userObject(email, true),
})

/** имитация встроенного отправителя Supabase */
function trySendMail(res) {
  if (flag('not-authorized')) {
    gotrueError(
      res,
      400,
      'email_address_not_authorized',
      'Email address not authorized. Please configure custom SMTP.',
    )
    return false
  }
  if (mailsSent >= QUOTA) {
    gotrueError(res, 429, 'over_email_send_rate_limit', 'email rate limit exceeded')
    return false
  }
  mailsSent++
  console.log(`  ✉ письмо отправлено (${mailsSent}/${QUOTA} в час)`)
  return true
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') return json(res, 204, {})

  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {}
    console.log(`${req.method} ${url.pathname}${url.search} ${raw || ''}`)

    if (url.pathname === '/auth/v1/settings') {
      return json(res, 200, {
        external: { email: true, phone: false },
        disable_signup: false,
        mailer_autoconfirm: AUTOCONFIRM,
        phone_autoconfirm: false,
        sms_provider: '',
      })
    }

    if (url.pathname === '/auth/v1/signup') {
      const email = String(body.email ?? '').toLowerCase()
      if (!email.includes('@')) return gotrueError(res, 400, 'validation_failed', 'Unable to validate email address: invalid format')
      if (/@(example|test)\.(com|org|net)$/.test(email))
        return gotrueError(res, 400, 'email_address_invalid', `Email address "${email}" is invalid`)
      if (users.has(email)) return json(res, 200, { ...userObject(email, false), identities: [] })
      if (AUTOCONFIRM) {
        users.set(email, { password: body.password, confirmed: true })
        return json(res, 200, session(email))
      }
      if (!trySendMail(res)) return
      users.set(email, { password: body.password, confirmed: false })
      return json(res, 200, userObject(email, false))
    }

    if (url.pathname === '/auth/v1/resend') {
      if (!trySendMail(res)) return
      return json(res, 200, {})
    }

    if (url.pathname === '/auth/v1/token') {
      const email = String(body.email ?? '').toLowerCase()
      const found = users.get(email)
      if (!found || found.password !== body.password)
        return gotrueError(res, 400, 'invalid_credentials', 'Invalid login credentials')
      if (!found.confirmed) return gotrueError(res, 400, 'email_not_confirmed', 'Email not confirmed')
      return json(res, 200, session(email))
    }

    if (url.pathname === '/auth/v1/logout') return json(res, 204, {})
    if (url.pathname === '/auth/v1/user') return json(res, 200, userObject('mock@mail.ru', true))

    // данные (таблицы) в заглушке не нужны — отдаём пустые списки
    if (url.pathname.startsWith('/rest/v1/')) return json(res, 200, [])

    return json(res, 404, { message: 'not found' })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Supabase Auth: http://0.0.0.0:${PORT}`)
  console.log(`  подтверждение email: ${AUTOCONFIRM ? 'выключено' : 'включено'}`)
  console.log(`  лимит писем: ${QUOTA} в час (дальше — over_email_send_rate_limit)`)
})
