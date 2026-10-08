/**
 * Supabase Edge Function «telegram-api» — webhook Telegram и API для сайта Mara OS.
 *
 * Маршруты и проверки HTTP — в api.mjs (общие с bot/server.mjs), логика бота — в core.mjs.
 * Этот файл только читает секреты и собирает обработчик:
 *   GET    /health                     — состояние webhook (без URL и текстов ошибок);
 *   GET    /api/telegram/link/status   — привязан ли Telegram к аккаунту сайта;
 *   POST   /api/telegram/link/preview  — какой Telegram-аккаунт у кода (второй шаг привязки);
 *   POST   /api/telegram/link/confirm  — подтвердить одноразовый код;
 *   DELETE /api/telegram/link          — отозвать доступ;
 *   POST   /                           — webhook Telegram (заголовок X-Telegram-Bot-Api-Secret-Token).
 *
 * Авторизация браузерных запросов — access token Supabase Auth. Токен BotFather
 * и service-role ключ живут только в секретах функции и никогда не попадают в сайт.
 *
 * Разворачивается командой `supabase functions deploy telegram-api --no-verify-jwt`
 * (verify_jwt выключен в supabase/config.toml: JWT проверяет сама функция).
 */
import { createBot } from './core.mjs'
import {
  buildAllowedOrigins,
  createTelegramApi,
  createWebhookHealth,
} from './api.mjs'

// Интерфейс Deno доступен только в рантайме Edge Functions; в тестах Node его нет.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void } | undefined

const FUNCTION_SLUG = 'telegram-api'

interface AppConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseServiceRoleKey?: string
  telegramToken?: string
  webhookSecret?: string
  webAppUrl?: string
  corsAllowedOrigins?: string
  allowLocalOrigins?: boolean
  fetchImpl?: typeof fetch
  now?: () => number
  logger?: Pick<Console, 'error' | 'warn'>
}

function readEnv(name: string): string {
  const fromDeno = typeof Deno !== 'undefined' ? Deno.env.get(name) : undefined
  const fromProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
  return String(fromDeno ?? fromProcess ?? '').trim()
}

export function createApp(config: AppConfig = {}) {
  const supabaseUrl = config.supabaseUrl ?? readEnv('SUPABASE_URL')
  const supabaseAnonKey = config.supabaseAnonKey ?? readEnv('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = config.supabaseServiceRoleKey ?? readEnv('SUPABASE_SERVICE_ROLE_KEY')
  const telegramToken = config.telegramToken ?? readEnv('TELEGRAM_BOT_TOKEN')
  const webhookSecret = config.webhookSecret ?? readEnv('TELEGRAM_WEBHOOK_SECRET')
  const webAppUrl = config.webAppUrl ?? readEnv('WEB_APP_URL')
  const now = config.now ?? (() => Date.now())
  const fetchImpl = config.fetchImpl ?? fetch
  const logger = config.logger ?? console

  const bot = createBot({
    telegramToken: telegramToken || 'not-configured',
    supabaseUrl: supabaseUrl || 'https://not-configured.supabase.co',
    supabaseAnonKey: supabaseAnonKey || 'not-configured',
    supabaseServiceRoleKey: supabaseServiceRoleKey || 'not-configured',
    webAppUrl,
    fetchImpl,
    logger,
    now,
  })

  return createTelegramApi({
    bot,
    allowedOrigins: buildAllowedOrigins({
      webAppUrl,
      extra: config.corsAllowedOrigins ?? readEnv('CORS_ALLOWED_ORIGINS'),
      allowLocal: config.allowLocalOrigins ?? readEnv('ALLOW_LOCAL_ORIGINS') === '1',
    }),
    health: createWebhookHealth({ bot, configured: Boolean(telegramToken), now, logger }),
    webhook: { enabled: true, secret: webhookSecret },
    basePaths: [`/functions/v1/${FUNCTION_SLUG}`, `/${FUNCTION_SLUG}`],
    logger,
  })
}

// Deno-рантайм Supabase Edge Functions. В Node (тесты) модуль только экспортирует createApp.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(createApp())
}
