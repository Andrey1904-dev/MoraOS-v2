/**
 * Hook Agent — генерирует 5 вариантов начала публикации или видео.
 *
 * Для каждого варианта: текст, тип хука, предполагаемый интерес
 * аудитории, связь с темой, риск клише, рекомендация.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ContentBrief, ContentIdea, HookVariant, HookAgentResult } from "./types";

export class HookAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async generateHooks(
    brief: ContentBrief,
    idea: ContentIdea,
    characterContext: CharacterContext,
  ): Promise<HookAgentResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);

    const prompt = [
      `Topic: ${brief.topic}`,
      `Selected idea: "${idea.title}" — ${idea.angle}`,
      `Format: ${brief.format}`,
      `Platform: ${brief.platform}`,
      "",
      "Generate exactly 5 different hook variants for the opening seconds of this content.",
      "Each hook must have a different approach:",
      "1. A question or challenge",
      "2. A surprising number or fact",
      "3. A vulnerable/personal confession",
      "4. A bold statement",
      "5. A scene-setting opener",
      "",
      "Do NOT invent real engagement metrics or retention predictions.",
      "audienceInterest, topicRelevance, clicheRisk are your editorial assessment, NOT measured data.",
      "",
      'Return JSON: { "hooks": [{ "id": string, "text": string, "type": string, "audienceInterest": "low"|"medium"|"high", "topicRelevance": "low"|"medium"|"high", "clicheRisk": "low"|"medium"|"high", "recommendation": string }] }',
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<HookAgentResult>(
      {
        agent: "hooks",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.9,
        maxTokens: 1000,
      },
      (raw) => sanitizeHookResult(raw),
    );

    await this.logger?.log({
      agent: "hooks",
      input: { topic: brief.topic, ideaId: idea.id },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

const VALID_LEVELS = ["low", "medium", "high"] as const;
function sanitizeLevel(v: unknown): "low" | "medium" | "high" {
  return VALID_LEVELS.includes(v as "low" | "medium" | "high") ? v as "low" | "medium" | "high" : "medium";
}

function sanitizeHookResult(raw: unknown): HookAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hooksArr = Array.isArray(obj.hooks) ? obj.hooks : [];
  const hooks: HookVariant[] = hooksArr
    .map((item, idx) => {
      const h = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(h.id ?? `hook_${idx + 1}`),
        text: String(h.text ?? "").trim().slice(0, 300),
        type: String(h.type ?? "general").trim().slice(0, 80),
        audienceInterest: sanitizeLevel(h.audienceInterest),
        topicRelevance: sanitizeLevel(h.topicRelevance),
        clicheRisk: sanitizeLevel(h.clicheRisk),
        recommendation: String(h.recommendation ?? "").trim().slice(0, 200),
      };
    })
    .filter((h) => h.text)
    .slice(0, 5);

  return {
    hooks: hooks.length ? hooks : [{ id: "hook_1", text: "Untitled hook", type: "general", audienceInterest: "medium", topicRelevance: "medium", clicheRisk: "medium", recommendation: "Needs refinement" }],
  };
}
