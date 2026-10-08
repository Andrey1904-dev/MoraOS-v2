import type { AIProvider } from "./provider";
import type { AiRunLogger, SalesAgentInput, SalesAgentResult } from "./types";

/**
 * Sales Agent — решает, что делать с точки зрения монетизации:
 * sell_now / wait / nurture / recommend_offer / no_sales.
 *
 * На текущем этапе агент НЕ отправляет ничего сам — он предлагает
 * действие, которое проходит через backend business rules и человека.
 */
export class SalesAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async decide(input: SalesAgentInput): Promise<SalesAgentResult> {
    const start = Date.now();
    const last = input.recentMessages.filter((m) => m.author === "fan").at(-1)?.body ?? "";

    const result = await this.provider.generateStructured<SalesAgentResult>(
      {
        agent: "sales",
        system:
          "You are the monetization brain of a virtual creator CRM. Decide if this moment is right to sell, nurture or wait. Respect the fan. Never push twice in a row. Return JSON only.",
        prompt: [
          `Fan: ${input.fan.name}`,
          `Relationship: ${input.fan.relationshipLevel}`,
          `LTV: $${input.fan.ltv} · Purchases: ${input.fan.purchases}`,
          `Subscription: ${input.fan.hasActiveSubscription ? "active" : "none"}`,
          `Available offers: ${input.offers.map((o) => `${o.name} ($${o.price}, ${o.type})`).join("; ") || "none"}`,
          `Last message: ${last}`,
          "",
          'Return {"action": "...", "offer_id": null|"...", "reason": "...", "confidence": 0..1}.',
        ].join("\n"),
        schema: { type: "object" },
        temperature: 0.3,
        maxTokens: 250,
      },
      (raw) => sanitizeSalesResult(raw, input),
    );

    const final = applyBusinessRules(result.data, input);

    await this.logger?.log({
      agent: "sales",
      input: { fan: input.fan.id, ltv: input.fan.ltv, purchases: input.fan.purchases },
      output: final,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return final;
  }
}

const ACTIONS = ["sell_now", "wait", "nurture", "recommend_offer", "no_sales"] as const;

function sanitizeSalesResult(raw: unknown, input: SalesAgentInput): SalesAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const action = (ACTIONS as readonly string[]).includes(String(obj.action))
    ? (obj.action as SalesAgentResult["action"])
    : "wait";
  const offerId = typeof obj.offer_id === "string" && input.offers.some((o) => o.id === obj.offer_id) ? (obj.offer_id as string) : null;
  return {
    action,
    offer_id: offerId,
    reason: typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : "No reason provided.",
    confidence: typeof obj.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : 0.5,
  };
}

/**
 * Backend business rules поверх предложения модели — важные уровни и
 * агрессивные продажи не проходят без веса и подтверждения.
 */
function applyBusinessRules(result: SalesAgentResult, input: SalesAgentInput): SalesAgentResult {
  // Нет офферов — продавать нечего.
  if (!input.offers.length && (result.action === "sell_now" || result.action === "recommend_offer")) {
    return { ...result, action: "no_sales", reason: "No live offers available." };
  }
  // Холодный фан без покупок: прямые продажи запрещены, только nurture.
  if (input.fan.purchases === 0 && !input.fan.hasActiveSubscription && result.action === "sell_now") {
    return { ...result, action: "nurture", reason: "First purchase never comes from a cold push — nurture first." };
  }
  // Рекомендация оффера без конкретного offer_id: подставляем дефолтный PPV.
  if (result.action === "recommend_offer" && !result.offer_id) {
    const ppv = input.offers.find((o) => o.type === "ppv") ?? input.offers[0];
    return { ...result, offer_id: ppv?.id ?? null };
  }
  // Низкая уверенность — понижаем действие до безопасного.
  if (result.confidence < 0.5 && (result.action === "sell_now" || result.action === "recommend_offer")) {
    return { ...result, action: "wait", reason: `${result.reason} (downgraded: low confidence)` };
  }
  return result;
}
