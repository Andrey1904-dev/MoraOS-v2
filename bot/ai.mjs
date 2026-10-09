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
    super('AI provider is not configured. Set AI_API_KEY (and optionally AI_BASE_URL, AI_MODEL) for the bot service.')
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
    if (!prompt || !String(prompt).trim()) throw new Error('AI prompt is empty.')
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
      throw new Error(`AI provider connection failed: ${error instanceof Error ? error.message : 'network error'}`)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 160) : `HTTP ${response.status}`
      throw new Error(`AI provider rejected the request: ${detail}`)
    }
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('AI provider returned an empty completion.')
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
  fans: 'audience (fan base) snapshot',
  inbox: 'inbox and conversation queue snapshot',
  revenue: 'revenue snapshot',
}

/** System prompt shared by all bot-side calls: Mara OS owner-assistant voice. */
const BOT_SYSTEM_PROMPT = [
  'You are the Mara OS operating assistant: a Telegram copilot for the owner of a',
  'virtual AI-creator studio. Write tight, factual, owner-facing briefings in the',
  'same language the metrics are labeled in (English). Short lines, no fluff,',
  'no invented numbers: use only the data supplied in the prompt. Never address',
  'fans and never draft messages to them.',
].join(' ')

/**
 * Content ideas prompt (bot-side analogue of the web ContentAgent):
 * grounded in the character card and the titles already in the pipeline.
 */
export function ideasPrompt({ characterName = 'Mara', characterDescription = '', platform = 'instagram', existingTitles = [] }) {
  const avoid = existingTitles.slice(0, 10).map((t) => `- ${t}`).join('\n')
  return [
    `Character: ${characterName}${characterDescription ? ` — ${characterDescription}` : ''}.`,
    `Platform: ${platform}.`,
    'Propose 5 content ideas for the next week that fit the persona.',
    avoid ? `Do NOT repeat these pipeline titles:\n${avoid}` : 'The pipeline is empty — any direction is fine.',
    '',
    'Output format (strict): 5 numbered lines, each "Title — one sentence hook".',
    'No preamble, no closing remarks.',
  ].join('\n')
}

/**
 * Analytical summary prompt for a metrics snapshot gathered from the owner's
 * own tables (fans / inbox / revenue).
 */
export function summaryPrompt(kind, snapshotText) {
  const label = DIGEST_BY_KIND[kind] ?? 'account snapshot'
  return [
    `Here is the owner's ${label} from Mara OS (current data, JSON lines):`,
    snapshotText,
    '',
    'Write a briefing of at most 6 short lines:',
    'line 1 — headline state; lines 2-4 — what changed / what matters;',
    'last line — one concrete recommended action.',
    'Use the numbers exactly as given, state the period where known.',
  ].join('\n')
}

export { BOT_SYSTEM_PROMPT }
