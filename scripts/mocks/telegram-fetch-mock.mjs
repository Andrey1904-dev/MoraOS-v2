/**
 * Подмена fetch для smoke-теста scripts/telegram-bot-setup.mjs.
 * Подключается через `node --import`, в сеть ничего не уходит.
 * Вызовы Bot API пишутся в файл из SMOKE_TG_LOG (только метод и тело, без токена).
 */
import { appendFileSync } from 'node:fs'

const logFile = process.env.SMOKE_TG_LOG
let menuButton = { type: 'commands' }
const ignoreMenu = process.env.SMOKE_TG_IGNORE_MENU === '1'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

globalThis.fetch = async (url, init = {}) => {
  const href = String(url)
  if (href.startsWith('https://api.telegram.org/bot')) {
    const method = href.split('/').pop()
    const body = init.body ? JSON.parse(init.body) : null
    if (logFile) appendFileSync(logFile, `${JSON.stringify({ method, body })}\n`)
    if (method === 'getMe') return json({ ok: true, result: { id: 1, is_bot: true, username: 'mara_os_test_bot' } })
    if (method === 'setChatMenuButton') {
      if (!ignoreMenu) menuButton = body.menu_button
      return json({ ok: true, result: true })
    }
    if (method === 'getChatMenuButton') return json({ ok: true, result: menuButton })
    if (method === 'getWebhookInfo') return json({ ok: true, result: { url: '', pending_update_count: 0 } })
    return json({ ok: true, result: true })
  }
  if (href.endsWith('/health')) return json({ ok: true, service: 'mara-telegram-api' })
  throw new Error(`Unexpected network call in smoke test: ${new URL(href).origin}`)
}
