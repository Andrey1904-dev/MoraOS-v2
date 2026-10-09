#!/usr/bin/env node
/**
 * Доставка opt-in дайджестов Mara OS в Telegram (внешний триггер: cron).
 *
 * Что делает за один запуск (скрипт сам по себе НИЧЕГО не планирует и не
 * зацикливает — расписание задаёт cron или планировщик хостинга):
 *   1. Берёт владельцев с включённым дайджестом (telegram_notification_settings.enabled).
 *   2. Для каждого связанного чата строит дайджест из свежих событий
 *      (bot/core.mjs buildDigest) — пустой дайджест не отправляется.
 *   3. Отправляет ОДНО сообщение на чат и только после успеха обновляет
 *      watermark — повторных сообщений о тех же событиях не будет.
 *   4. Минимальный интервал между дайджестами на чат (по умолчанию 30 минут)
 *      защищает от слишком частого cron: чаще — пропуск.
 *
 * Пример crontab (раз в час; реже — ещё безопаснее):
 *   0 * * * * cd /opt/mora-os && node scripts/telegram-notify.mjs >> /var/log/mara-notify.log 2>&1
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * TELEGRAM_BOT_TOKEN (+ опционально SUPABASE_ANON_KEY, WEB_APP_URL,
 * NOTIFY_MIN_INTERVAL_MINUTES). Секреты — только в окружении хоста.
 *
 *   node scripts/telegram-notify.mjs           — отправка;
 *   node scripts/telegram-notify.mjs --dry-run — показать, что ушло бы.
 */
import { createBot } from '../bot/core.mjs'

const dryRun = process.argv.includes('--dry-run')

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? 'not-needed').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
const WEB_APP_URL = (process.env.WEB_APP_URL ?? '').trim()
const MIN_INTERVAL_MINUTES = Math.max(0, Number(process.env.NOTIFY_MIN_INTERVAL_MINUTES ?? 30) || 30)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
  console.error('Нужны SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY и TELEGRAM_BOT_TOKEN (см. bot/.env.example).')
  process.exit(1)
}

const bot = createBot({
  telegramToken: TELEGRAM_BOT_TOKEN,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  webAppUrl: WEB_APP_URL,
  transportMode: 'polling',
  // Только для тестовых стендов: переопределить адрес Bot API (по умолчанию — продакшн).
  telegramApiBase: (process.env.TELEGRAM_API_BASE ?? '').trim() || undefined,
})

const enabledRows = await bot.supabaseRest(
  `telegram_notification_settings?${new URLSearchParams({ select: 'user_id,last_notified_at', enabled: 'eq.true', limit: '500' })}`,
)
const targets = Array.isArray(enabledRows) ? enabledRows : []
if (!targets.length) {
  console.log('Дайджест не включён ни у одного владельца — отправок нет.')
  process.exit(0)
}

const cutoff = MIN_INTERVAL_MINUTES > 0 ? Date.now() - MIN_INTERVAL_MINUTES * 60_000 : 0
const due = targets.filter((row) => !row.last_notified_at || Date.parse(row.last_notified_at) <= cutoff)
if (!due.length) {
  console.log(`Все ${targets.length} подписчик(ов) ещё внутри минимального интервала — пропуск.`)
  process.exit(0)
}

const links = await bot.supabaseRest(
  `telegram_links?${new URLSearchParams({
    select: 'telegram_chat_id,user_id',
    user_id: `in.(${due.map((row) => row.user_id).join(',')})`,
    limit: '500',
  })}`,
)
const chats = Array.isArray(links) ? links : []

let sent = 0
let quiet = 0
for (const link of chats) {
  try {
    const digest = await bot.buildDigest(link.telegram_chat_id)
    if (digest.skipped || !digest.text) {
      quiet += 1
      continue
    }
    if (dryRun) {
      console.log(`--- dry-run: чат ${link.telegram_chat_id} получил бы:\n${digest.text}\n`)
      sent += 1
      continue
    }
    await bot.sendMessage(link.telegram_chat_id, digest.text)
    await bot.writeNotificationSettings(digest.userId, {
      watermark: digest.watermark,
      last_notified_at: new Date().toISOString(),
    })
    sent += 1
  } catch (error) {
    // Ошибка одного чата не должна останавливать остальных и не двигает watermark.
    console.error(`[notify] чат ${link.telegram_chat_id}:`, error instanceof Error ? error.message : 'unknown error')
  }
}

console.log(`Готово: отправлено ${sent}, без новостей ${quiet}, всего чатов ${chats.length}.${dryRun ? ' (dry-run, watermark не менялся)' : ''}`)
