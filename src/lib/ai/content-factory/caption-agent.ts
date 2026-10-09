/**
 * Caption Agent — генерирует 5 вариантов подписей к публикации.
 *
 * Стили: короткая, расширенная, разговорная, сюжетная, вовлекающая.
 * Не добавляет хештеги автоматически — только если формат требует.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ContentBrief, ScriptResult, CaptionVariant, CaptionAgentResult } from "./types";

export class CaptionAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async generateCaptions(
    brief: ContentBrief,
    script: ScriptResult,
    characterContext: CharacterContext,
  ): Promise<CaptionAgentResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);
    const needsHashtags = brief.format === "Short Video" || brief.format === "Reel" || brief.format === "TikTok";

    const prompt = [
      `Topic: ${brief.topic}`,
      `Format: ${brief.format}`,
      `Platform: ${brief.platform}`,
      `Script caption base: "${script.caption}"`,
      `Script CTA: "${script.cta}"`,
      "",
      "Generate 5 caption variants with DIFFERENT styles:",
      "1. short — 1-2 punchy lines",
      "2. extended — fuller context, 3-5 lines",
      "3. conversational — like talking to a friend",
      "4. story — ties into Mara's storyline and red notebook",
      "5. engagement — asks a question or invites interaction",
      "",
      needsHashtags
        ? "Include 3-5 relevant hashtags ONLY in the 'short' variant. Other variants should not have hashtags."
        : "Do NOT add hashtags to any variant — this is a text-first format.",
      "",
      "Each caption must feel like Mara wrote it, not a marketing team.",
      "",
      'Return JSON: { "captions": [{ "style": "short"|"extended"|"conversational"|"story"|"engagement", "text": string }] }',
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<CaptionAgentResult>(
      {
        agent: "captions",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.85,
        maxTokens: 1200,
      },
      (raw) => sanitizeCaptionResult(raw),
    );

    await this.logger?.log({
      agent: "captions",
      input: { topic: brief.topic, format: brief.format },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeCaptionResult(raw: unknown): CaptionAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const captionsArr = Array.isArray(obj.captions) ? obj.captions : [];
  const validStyles = ["short", "extended", "conversational", "story", "engagement"] as const;

  const captions: CaptionVariant[] = captionsArr
    .map((c) => {
      const item = (c ?? {}) as Record<string, unknown>;
      const style = validStyles.includes(item.style as typeof validStyles[number])
        ? (item.style as CaptionVariant["style"])
        : "short";
      return {
        style,
        text: String(item.text ?? "").trim().slice(0, 1000),
      };
    })
    .filter((c) => c.text);

  return { captions };
}
