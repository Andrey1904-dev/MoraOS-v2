import type { AIProvider } from "./provider";
import type { AiRunLogger, MemoryAgentInput, MemoryAgentResult } from "./types";

/**
 * Memory Agent — решает, какие факты из диалога заслуживают долгосрочной
 * памяти о фане. Возвращает один факт за проход или null; дедуплицирует
 * против существующих воспоминаний, чтобы база не заполнялась мусором.
 */
export class MemoryAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async extract(input: MemoryAgentInput): Promise<MemoryAgentResult> {
    const start = Date.now();
    const historyText = input.history
      .slice(-16)
      .map((m) => `${m.author}: ${m.body}`)
      .join("\n");
    const last = input.history.filter((m) => m.author === "fan").at(-1)?.body ?? "";

    const result = await this.provider.generateStructured<MemoryAgentResult>(
      {
        agent: "memory",
        system:
          "You extract long-term facts about a fan from a conversation. Only durable, useful facts (location, work, preferences, purchase habits, boundaries). Never small talk. Return JSON only.",
        prompt: [
          `Existing memories: ${input.existingMemories.map((m) => m.memory).join("; ") || "none"}`,
          "",
          "Conversation:",
          historyText,
          `Last message: ${last}`,
          "",
          'Return {"memory": null} if nothing durable, or {"memory": "...", "category": "...", "importance": 0..1}.',
        ].join("\n"),
        schema: { type: "object" },
        temperature: 0.2,
        maxTokens: 200,
      },
      (raw) => sanitizeMemoryResult(raw, input.existingMemories),
    );

    await this.logger?.log({
      agent: "memory",
      input: { last, existing: input.existingMemories.length },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeMemoryResult(raw: unknown, existing: { memory: string }[]): MemoryAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  if (obj.memory === null || obj.memory === undefined) return { memory: null };
  if (typeof obj.memory !== "string" || !obj.memory.trim()) return { memory: null };
  const memory = obj.memory.trim().slice(0, 200);

  // Дедупликация: если очень похожий факт уже есть — не создаём дубль.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (existing.some((m) => norm(m.memory).includes(norm(memory)) || norm(memory).includes(norm(m.memory)))) {
    return { memory: null };
  }

  const importance = typeof obj.importance === "number" ? Math.min(1, Math.max(0.1, obj.importance)) : 0.5;
  return {
    memory,
    category: typeof obj.category === "string" && obj.category.trim() ? obj.category.trim() : "personal",
    importance,
  };
}
