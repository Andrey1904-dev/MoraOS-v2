/**
 * HttpAIProvider — реальный провайдер AI для server-side использования.
 *
 * Используется ТОЛЬКО в Node/Ege Function транспортах (bot/ и supabase/functions/).
 * Никогда не импортировать в клиентский код; ключ API берётся из process.env
 * (AI_API_KEY, AI_BASE_URL, AI_MODEL — без префикса VITE_*).
 *
 * Совместим с OpenAI Chat Completions (/v1/chat/completions) и OpenAI-compatible
 * эндпоинтами (Groq, Together, DeepSeek, Ollama/openai-proxy и т.п.).
 */

import type { AIGenerateRequest, AIGenerateResult, AIProvider, AIStructuredResult } from './provider';
import { parseJsonFromText } from './provider';

export interface HttpAIProviderOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
  /** Функция fetch — в Node инжектируется глобальный fetch из Node 18+/edge runtime. */
  fetchImpl?: typeof fetch
  /** Timeout одного запроса в мс, по умолчанию 60 000. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000;



export class HttpAIProvider implements AIProvider {
  readonly name = 'http';
  readonly isMock = false;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpAIProviderOptions = {}) {
    // В Edge Function process.env — доступен. В клиенте Vite не подставит эти ключи
    // (нет префикса VITE_), так что импортировать оттуда бесполезно и безопасно.
    const envApiKey = typeof process !== 'undefined' ? (process.env?.AI_API_KEY ?? '') : '';
    const envBase = typeof process !== 'undefined' ? (process.env?.AI_BASE_URL ?? 'https://api.openai.com/v1') : 'https://api.openai.com/v1';
    const envModel = typeof process !== 'undefined' ? (process.env?.AI_MODEL ?? 'gpt-4o-mini') : 'gpt-4o-mini';
    this.apiKey = opts.apiKey ?? envApiKey;
    this.baseUrl = (opts.baseUrl ?? envBase).replace(/\/+$/, '');
    this.model = opts.model ?? envModel;
    this.fetchImpl = opts.fetchImpl ?? (typeof globalThis !== 'undefined' ? globalThis.fetch.bind(globalThis) : (fetch as typeof fetch));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResult> {
    if (!this.isConfigured()) {
      throw new Error(
        'HttpAIProvider is not configured: set AI_API_KEY (server-side env var, never VITE_*).'
      );
    }
    const startedAt = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (request.system) {
        messages.push({ role: 'system', content: request.system });
      }
      let userPrompt = request.prompt;
      if (request.schema) {
        userPrompt +=
          '\n\nОтвечай СТРОГО в JSON, соответствующем схеме (без Markdown, без ```):\n' +
          JSON.stringify(request.schema);
      }
      messages.push({ role: 'user', content: userPrompt });

      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxTokens ?? 1200,
          response_format: request.schema ? { type: 'json_object' } : undefined,
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`AI request failed: ${response.status} ${response.statusText} ${body.slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { total_tokens?: number }
        model?: string
      };

      const text = data.choices?.[0]?.message?.content ?? '';
      const durationMs = Date.now() - startedAt;
      return {
        text,
        mock: false,
        model: data.model ?? this.model,
        tokens: data.usage?.total_tokens,
        durationMs,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        throw new Error(`AI request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async generateStructured<T>(
    request: AIGenerateRequest,
    parse: (raw: unknown) => T,
  ): Promise<AIStructuredResult<T>> {
    const result = await this.generate(request);
    const parsed = parseJsonFromText(result.text);
    if (parsed === null) {
      throw new Error(`AI response did not contain valid JSON: ${result.text.slice(0, 300)}`);
    }
    return {
      data: parse(parsed),
      mock: result.mock,
      model: result.model,
      durationMs: result.durationMs,
    };
  }

  async embed(_text: string): Promise<number[]> {
    // TODO: вызвать /v1/embeddings у провайдера.
    // Сейчас возвращаем ошибку, чтобы не падало молча в проде — MockAIProvider
    // предоставляет стаб для демо и тестов.
    throw new Error('HttpAIProvider.embed() is not yet implemented. Configure embeddings or use MockAIProvider.');
  }
}
