/**
 * Server-side AI client for the Mara OS Telegram bot.
 *
 * Thin OpenAI-compatible chat-completions client (`/v1/chat/completions`),
 * the bot-side sibling of `src/lib/ai/http-provider.ts`. Same env contract:
 *   AI_API_KEY   — provider key, server-side secret only (never VITE_*);
 *   AI_BASE_URL  — e.g. https://api.openai.com/v1 (Groq/Together/DeepSeek etc.);
 *   AI_MODEL     — e.g. gpt-4o-mini.
 *
 * Honesty rule: when the key is missing the client reports "not configured"
 * and NOTHING is generated — the bot never fabricates AI output. Every real
 * call is logged to `ai_runs` by the caller (core.mjs), like the web console.
 *
 * Works in both transports (Node 22 and the Deno Edge runtime): fetch only,
 * no platform APIs. Copied to supabase/functions/telegram-api/ by sync:edge.
 */

/** Thrown when AI_API_KEY is missing; the bot turns this into an honest reply. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI-провайдер не настроен. Задайте AI_API_KEY (и опционально AI_BASE_URL, AI_MODEL) для сервиса бота.')
    this.code = 'AI_NOT_CONFIGURED'
  }
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TIMEOUT_MS = 60_000
/** Hard ceiling for a single completion; bot replies stay within Telegram limits. */
const MAX_COMPLETION_TOKENS = 900

/**
 * @param {object} config
 * @param {string} [config.apiKey]
 * @param {string} [config.baseUrl]
 * @param {string} [config.model]
 * @param {typeof fetch} [config.fetchImpl]
 * @param {number} [config.timeoutMs]
 */
export function createAiClient({
  apiKey = '',
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const key = String(apiKey ?? '').trim()
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE_URL
  const modelName = String(model ?? '').trim() || DEFAULT_MODEL

  /**
   * One chat completion. Returns { text, model, tokens, durationMs }.
   * `agent` is a semantic label for ai_runs logging (done by the caller).
   */
  async function generate({ system = '', prompt, temperature = 0.7, maxTokens = MAX_COMPLETION_TOKENS }) {
    if (!key) throw new AiNotConfiguredError()
    if (!prompt || !String(prompt).trim()) throw new Error('Пустой промпт для AI.')
    const started = Date.now()
    let response
    try {
      response = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: String(prompt) },
          ],
          temperature,
          max_tokens: Math.min(MAX_COMPLETION_TOKENS, Math.max(64, Number(maxTokens) || MAX_COMPLETION_TOKENS)),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new Error(`Не удалось соединиться с AI-провайдером: ${error instanceof Error ? error.message : 'ошибка сети'}`)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 160) : `HTTP ${response.status}`
      throw new Error(`AI-провайдер отклонил запрос: ${detail}`)
    }
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('AI-провайдер вернул пустой ответ.')
    }
    return {
      text: text.trim(),
      model: String(data?.model ?? modelName),
      tokens: typeof data?.usage?.total_tokens === 'number' ? data.usage.total_tokens : null,
      durationMs: Date.now() - started,
    }
  }

  return {
    /** False ⇒ callers answer honestly that the provider is not set up. */
    isConfigured: key.length > 0,
    /** Short label for status screens; never contains the key. */
    providerLabel: key.length > 0 ? `${base.replace(/^https?:\/\//, '')} · ${modelName}` : '',
    model: modelName,
    generate,
  }
}

/* ------------------------------------------------------------ prompts --- */

const DIGEST_BY_KIND = {
  fans: 'срез аудитории (базы фанов)',
  inbox: 'срез инбокса и очереди диалогов',
  revenue: 'срез выручки',
}

/** System prompt shared by all bot-side calls: Mara OS owner-assistant voice. */
const BOT_SYSTEM_PROMPT = [
  'Ты — операционный ассистент Mara OS: Telegram-копилот для владельца',
  'виртуальной AI-студии креатора. Пиши плотные, фактические сводки для владельца',
  'на русском языке. Короткие строки, без воды, без выдуманных цифр:',
  'используй только данные из промпта. Никогда не обращайся к фанам',
  'и не пиши им сообщения.',
].join(' ')

/**
 * Content ideas prompt (bot-side analogue of the web ContentAgent):
 * grounded in the character card and the titles already in the pipeline.
 */
export function ideasPrompt({ characterName = 'Mara', characterDescription = '', platform = 'instagram', existingTitles = [] }) {
  const avoid = existingTitles.slice(0, 10).map((t) => `- ${t}`).join('\n')
  return [
    `Персонаж: ${characterName}${characterDescription ? ` — ${characterDescription}` : ''}.`,
    `Площадка: ${platform}.`,
    'Предложи 5 идей контента на следующую неделю, которые подходят персоне.',
    avoid ? `НЕ повторяй эти заголовки из конвейера:\n${avoid}` : 'Конвейер пуст — подойдёт любое направление.',
    '',
    'Формат вывода (строго): 5 нумерованных строк, каждая «Заголовок — хук в одно предложение».',
    'Без вступления и без заключительных фраз. Отвечай по-русски.',
  ].join('\n')
}

/**
 * Analytical summary prompt for a metrics snapshot gathered from the owner's
 * own tables (fans / inbox / revenue).
 */
export function summaryPrompt(kind, snapshotText) {
  const label = DIGEST_BY_KIND[kind] ?? 'срез аккаунта'
  return [
    `Это ${label} владельца из Mara OS (актуальные данные, JSON-строки):`,
    snapshotText,
    '',
    'Напиши сводку не длиннее 6 коротких строк:',
    'строка 1 — главное состояние; строки 2-4 — что изменилось / что важно;',
    'последняя строка — одно конкретное рекомендованное действие.',
    'Используй цифры ровно как даны, указывай период, если он известен. Отвечай по-русски.',
  ].join('\n')
}

export { BOT_SYSTEM_PROMPT }
