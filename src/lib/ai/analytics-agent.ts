import type { AIProvider } from "./provider";
import type { AiRunLogger, AnalyticsAgentInput, AnalyticsAgentResult } from "./types";

/**
 * Analytics Agent — превращает метрики (контент, воронка, выручка,
 * подписки, churn, LTV) в конкретные рекомендации. Никаких
 * «контент показывает хорошие результаты» — только измеримые выводы.
 */
export class AnalyticsAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async analyze(input: AnalyticsAgentInput): Promise<AnalyticsAgentResult> {
    const start = Date.now();
    const result = await this.provider.generateStructured<AnalyticsAgentResult>(
      {
        agent: "analytics",
        system:
          "You are the analytics brain of a virtual creator business. Given metrics, produce specific, measurable recommendations — always with numbers. Return JSON only.",
        prompt: [
          "Metrics:",
          ...input.metrics.map((m) => `- ${m.label}: ${m.value} (delta ${m.delta}%)`),
          input.topContent?.length
            ? `Top content: ${input.topContent.map((c) => `${c.title} (${c.platform}, ${c.views} views)`).join("; ")}`
            : "",
          input.funnel?.length ? `Funnel: ${input.funnel.map((f) => `${f.label}=${f.value}`).join(" → ")}` : "",
          "",
          "Return {\"insights\": [{\"kind\", \"title\", \"body\", \"recommendation\", \"confidence\"}]}.",
        ]
          .filter(Boolean)
          .join("\n"),
        schema: { type: "object" },
        temperature: 0.3,
        maxTokens: 700,
      },
      (raw) => sanitizeAnalyticsResult(raw),
    );

    await this.logger?.log({
      agent: "analytics",
      input: { metrics: input.metrics.length },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeAnalyticsResult(raw: unknown): AnalyticsAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(obj.insights) ? obj.insights : [];
  const insights = list
    .map((rawItem) => {
      const i = (rawItem ?? {}) as Record<string, unknown>;
      const kind = i.kind === "risk" || i.kind === "recommendation" ? i.kind : "insight";
      return {
        kind: kind as "insight" | "recommendation" | "risk",
        title: String(i.title ?? "Insight"),
        body: String(i.body ?? ""),
        recommendation: String(i.recommendation ?? ""),
        confidence: typeof i.confidence === "number" ? Math.min(1, Math.max(0, i.confidence)) : 0.5,
      };
    })
    .filter((i) => i.title)
    .slice(0, 6);
  return { insights };
}
