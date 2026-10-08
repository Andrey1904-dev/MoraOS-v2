import type { AIProvider } from "./provider";
import { CharacterAgent } from "./character-agent";
import type {
  AiRunLogger,
  ConversationAgentInput,
  ConversationAgentResult,
} from "./types";

const RELATIONSHIP_LEVELS = ["visitor", "follower", "regular", "fan", "favorite", "inner_circle"] as const;

/**
 * Conversation Agent — черновики ответов Mara в диалогах.
 *
 * Вход: фан, история диалога, долгосрочная память, уровень отношений,
 * недавние покупки и контекст персонажа. Выход — структурированный
 * результат; ничего не отправляется автоматически, черновик проходит
 * human approval в инбоксе.
 */
export class ConversationAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly characterAgent = new CharacterAgent(),
    private readonly logger?: AiRunLogger,
  ) {}

  async reply(input: ConversationAgentInput): Promise<ConversationAgentResult> {
    const history = input.history.slice(-12);
    const historyText = history.map((m) => `${m.author === "fan" ? input.fan.name : "Mara"}: ${m.body}`).join("\n");
    const last = history.filter((m) => m.author === "fan").at(-1)?.body ?? "";
    const start = Date.now();

    const prompt = [
      `Fan: ${input.fan.name}`,
      `Relationship: ${input.fan.relationshipLevel}`,
      `LTV: $${input.fan.ltv} · Purchases: ${input.fan.purchases} · Subscription: ${input.fan.hasActiveSubscription ? "active" : "none"}`,
      `Source: ${input.fan.source}`,
      input.memories.length
        ? `Memories: ${input.memories.map((m) => m.memory).join("; ")}`
        : "Memories: none yet",
      `Recent purchases (30d): ${input.recentPurchases ?? 0}`,
      "",
      "Conversation (oldest → newest):",
      historyText,
      `Last message: ${last}`,
      "",
      "Draft Mara's next reply. Return JSON only.",
    ].join("\n");

    const result = await this.provider.generateStructured<ConversationAgentResult>(
      {
        agent: "conversation",
        system: this.characterAgent.systemPrompt(input.character),
        prompt,
        schema: { type: "object" },
        temperature: 0.7,
        maxTokens: 500,
      },
      (raw) => sanitizeConversationResult(raw, input),
    );

    const voice = this.characterAgent.check(result.data.reply, input.character);
    const final: ConversationAgentResult = voice.ok
      ? result.data
      : { ...result.data, confidence: Math.min(result.data.confidence, 0.5) };

    await this.logger?.log({
      agent: "conversation",
      input: { fan: input.fan.id, last, memories: input.memories.length },
      output: final,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return final;
  }
}

function sanitizeConversationResult(raw: unknown, input: ConversationAgentInput): ConversationAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const level = str(obj.relationship_level).toLowerCase().replace(" ", "_");
  const intent = str(obj.intent, "other");
  const sales = str(obj.sales_action, "none");
  const mem = obj.memory_candidate as Record<string, unknown> | null | undefined;
  return {
    reply: str(obj.reply, "…"),
    intent: (["greeting", "flirting", "price_check", "story_followup", "support", "smalltalk"] as const).includes(
      intent as never,
    )
      ? (intent as ConversationAgentResult["intent"])
      : "other",
    sales_action: (["none", "recommend_offer", "wait", "nurture"] as const).includes(sales as never)
      ? (sales as ConversationAgentResult["sales_action"])
      : "none",
    memory_candidate:
      mem && typeof mem.memory === "string" && mem.memory.trim()
        ? {
            memory: mem.memory.trim(),
            category: str(mem.category, "personal"),
            importance: Math.min(1, Math.max(0, num(mem.importance, 0.5))),
          }
        : null,
    relationship_level: (RELATIONSHIP_LEVELS as readonly string[]).includes(level)
      ? (level as ConversationAgentResult["relationship_level"])
      : input.fan.relationshipLevel,
    confidence: Math.min(1, Math.max(0, num(obj.confidence, 0.5))),
  };
}
