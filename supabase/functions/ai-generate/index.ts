/**
 * Supabase Edge Function «ai-generate» — серверный AI endpoint для веб-приложения.
 *
 * Принимает аутентифицированные POST-запросы с параметрами генерации,
 * вызывает OpenAI-совместимый API, логирует результат в ai_runs и
 * возвращает структурированный ответ.
 *
 * Маршруты:
 *   GET  /health          — проверка работоспособности (без секретов)
 *   POST /generate        — вызвать AI-агента
 *
 * Авторизация: Supabase Auth access token (Bearer).
 * Секреты: AI_API_KEY, AI_BASE_URL, AI_MODEL — только в env функции.
 *
 * Разворачивается командой:
 *   supabase functions deploy ai-generate --no-verify-jwt
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
} | undefined;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function readEnv(name: string): string {
  if (typeof Deno !== "undefined") return Deno.env.get(name) ?? "";
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] ?? "";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

interface AiRequest {
  agent: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  schema?: Record<string, unknown>;
}

/**
 * Простой OpenAI-совместимый HTTP-клиент. Дублирует HttpAIProvider,
 * но работает в Deno-рантайме без Node-зависимостей.
 */
async function callAiProvider(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
  request: AiRequest;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ text: string; model: string; tokens?: number; durationMs: number }> {
  const { apiKey, baseUrl, model, request, fetchImpl = fetch, timeoutMs = 60_000 } = config;
  const started = Date.now();

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (request.system) messages.push({ role: "system", content: request.system });

  let userPrompt = request.prompt;
  if (request.schema) {
    userPrompt += "\n\nRespond ONLY with valid JSON matching this schema (no Markdown, no ```):\n" + JSON.stringify(request.schema);
  }
  messages.push({ role: "user", content: userPrompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: Math.min(2000, Math.max(64, request.maxTokens ?? 1200)),
        response_format: request.schema ? { type: "json_object" } : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI provider returned ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("AI provider returned empty response");

    return {
      text: text.trim(),
      model: data.model ?? model,
      tokens: data.usage?.total_tokens,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Валидация JWT через Supabase Auth.
 */
async function verifyAuth(supabaseUrl: string, supabaseAnonKey: string, authHeader: string): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Запись запуска в ai_runs через Supabase REST API с service_role.
 */
async function logAiRun(config: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  agent: string;
  input: unknown;
  output: unknown;
  status: "success" | "error";
  model: string;
  durationMs: number;
}): Promise<void> {
  try {
    await fetch(`${config.supabaseUrl}/rest/v1/ai_runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: config.userId,
        agent: config.agent,
        input: config.input,
        output: config.output,
        status: config.status,
        model: config.model,
        duration_ms: config.durationMs,
      }),
    });
  } catch {
    // Логирование — вспомогательный канал, не ломаем основной ответ.
  }
}

/** Максимальная длина промпта для защиты от чрезмерных запросов. */
const MAX_PROMPT_LENGTH = 8000;
/** Максимальная длина system prompt. */
const MAX_SYSTEM_LENGTH = 4000;

export function createApp(config: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}) {
  const supabaseUrl = config.supabaseUrl ?? readEnv("SUPABASE_URL");
  const supabaseAnonKey = config.supabaseAnonKey ?? readEnv("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = config.supabaseServiceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const aiApiKey = config.aiApiKey ?? readEnv("AI_API_KEY");
  const aiBaseUrl = (config.aiBaseUrl ?? readEnv("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const aiModel = config.aiModel ?? readEnv("AI_MODEL") ?? "gpt-4o-mini";
  const fetchImpl = config.fetchImpl ?? fetch;

  return async (request: Request): Promise<Response> => {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/functions\/v1\/ai-generate/, "").replace(/\/ai-generate/, "");

    // Health check — без авторизации
    if (request.method === "GET" && (path === "/health" || path === "")) {
      return json({
        status: "ok",
        configured: Boolean(aiApiKey),
        model: aiModel,
        provider: aiBaseUrl.replace(/^https?:\/\//, ""),
      });
    }

    // Generate endpoint
    if (request.method === "POST" && path === "/generate") {
      // Auth
      const authHeader = request.headers.get("Authorization") ?? "";
      if (!authHeader) return errorResponse("Missing Authorization header", 401);

      const userId = await verifyAuth(supabaseUrl, supabaseAnonKey, authHeader);
      if (!userId) return errorResponse("Invalid or expired token", 401);

      // Check AI configured
      if (!aiApiKey) {
        return json({
          error: "AI provider is not configured. Set AI_API_KEY on the Edge Function.",
          mock: false,
        }, 503);
      }

      // Parse body
      let body: AiRequest;
      try {
        body = await request.json() as AiRequest;
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      // Validate
      if (!body.agent || !body.prompt) {
        return errorResponse("Missing required fields: agent, prompt", 400);
      }
      if (body.prompt.length > MAX_PROMPT_LENGTH) {
        return errorResponse(`Prompt too long (${body.prompt.length} > ${MAX_PROMPT_LENGTH})`, 400);
      }
      if (body.system && body.system.length > MAX_SYSTEM_LENGTH) {
        return errorResponse(`System prompt too long (${body.system.length} > ${MAX_SYSTEM_LENGTH})`, 400);
      }

      // Call AI
      const started = Date.now();
      try {
        const result = await callAiProvider({
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          model: aiModel,
          request: body,
          fetchImpl,
        });

        // Log to ai_runs
        await logAiRun({
          supabaseUrl,
          serviceRoleKey: supabaseServiceRoleKey,
          userId,
          agent: body.agent,
          input: { agent: body.agent, promptLength: body.prompt.length },
          output: { textLength: result.text.length },
          status: "success",
          model: result.model,
          durationMs: Date.now() - started,
        });

        return json({
          text: result.text,
          mock: false,
          model: result.model,
          tokens: result.tokens,
          durationMs: result.durationMs,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const durationMs = Date.now() - started;

        // Log error
        await logAiRun({
          supabaseUrl,
          serviceRoleKey: supabaseServiceRoleKey,
          userId,
          agent: body.agent,
          input: { agent: body.agent, promptLength: body.prompt.length },
          output: { error: errorMessage.slice(0, 200) },
          status: "error",
          model: aiModel,
          durationMs,
        });

        return json({
          error: errorMessage,
          mock: false,
          model: aiModel,
          durationMs,
        }, 502);
      }
    }

    return errorResponse("Not found", 404);
  };
}

// Deno runtime entry point
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve(createApp());
}
