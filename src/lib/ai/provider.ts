/**
 * Абстракция AI-провайдера Mara OS.
 *
 * Ни один компонент не привязан к конкретному вендору: агенты получают
 * `AIProvider` через инъекцию. Реализации:
 *   • MockAIProvider  — детерминированные ответы без ключа (демо и тесты);
 *   • HttpAIProvider  — OpenAI-совместимый endpoint (только server-side:
 *                       bot server / Edge Function; ключ никогда не VITE_*).
 */

export interface AIGenerateRequest {
  /** Роль/цель вызова — используется в логах ai_runs. */
  agent: string
  system?: string
  prompt: string
  /** Подсказка модели для структурированного вывода (JSON schema-подобная). */
  schema?: Record<string, unknown>
  temperature?: number
  maxTokens?: number
}

export interface AIGenerateResult {
  text: string
  /** true — ответ сгенерирован mock-провайдером, не настоящей моделью. */
  mock: boolean
  model: string
  tokens?: number
  durationMs: number
}

export interface AIProvider {
  readonly name: string
  readonly isMock: boolean
  generate(request: AIGenerateRequest): Promise<AIGenerateResult>
  /** Гарантированный парсинг JSON-ответа (валидирует и нормализует). */
  generateStructured<T>(request: AIGenerateRequest, parse: (raw: unknown) => T): Promise<AIStructuredResult<T>>
  /** Векторное представление для поиска по памяти/контенту. */
  embed(text: string): Promise<number[]>
}

export interface AIStructuredResult<T> {
  data: T
  mock: boolean
  model: string
  durationMs: number
}

/** Безопасный разбор JSON из текстового ответа модели. */
export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed)
  const body = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(body.slice(start, end + 1))
    }
    throw new Error("AI response is not valid JSON")
  }
}
