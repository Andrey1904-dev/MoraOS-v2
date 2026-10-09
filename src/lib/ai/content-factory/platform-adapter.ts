/**
 * Platform Adaptation Agent — формирует отдельные версии для TikTok,
 * Instagram Reels и Threads на основе одного сценария.
 *
 * Не делает три копии одного текста. Каждая версия адаптирована
 * под формат и аудиторию платформы.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ContentBrief, ScriptResult, PlatformVariant, PlatformAdapterResult, ContentPlatform } from "./types";

const PLATFORM_GUIDELINES: Record<ContentPlatform, string> = {
  TikTok: "TikTok: Short, punchy, hook in first 0.5s. Text overlays are critical. Sound-native. Young audience expects authenticity. Hashtags go in caption, max 5. Video-first platform.",
  Instagram: "Instagram Reels: Slightly more polished visual feel. Hook within first 1-2s. Caption can be longer and more editorial. Hashtags in first comment or end of caption. Cross-post potential with Stories. Visual quality matters more than on TikTok.",
  Threads: "Threads: Text-first platform. No video assumptions. Conversational tone, shorter paragraphs. Engagement comes from replies and quotes. No hashtags needed. Link-friendly. More personal diary energy than other platforms.",
};

export class PlatformAdapterAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async adaptForPlatforms(
    brief: ContentBrief,
    script: ScriptResult,
    characterContext: CharacterContext,
  ): Promise<PlatformAdapterResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);

    const platforms: ContentPlatform[] = ["TikTok", "Instagram", "Threads"];

    const prompt = [
      `Topic: ${brief.topic}`,
      `Script hook: "${script.hook}"`,
      `Script caption: "${script.caption}"`,
      `Script CTA: "${script.cta}"`,
      `Main beats summary: ${script.mainBeats.map((b) => b.label).join(", ")}`,
      "",
      "Create THREE distinctly different versions for the following platforms.",
      "Each version must feel native to its platform — NOT the same text with the platform name swapped.",
      "",
      ...platforms.map((p) => `### ${p}\n${PLATFORM_GUIDELINES[p]}`),
      "",
      "Do NOT invent character limits or algorithmic rules you are unsure of.",
      "For constraints you cannot verify, write 'check current platform guidelines'.",
      "",
      'Return JSON: { "variants": [{ "platform": "TikTok"|"Instagram"|"Threads", "text": string, "format": string, "cta": string, "visualNotes": string, "platformConstraints": string[] }] }',
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<PlatformAdapterResult>(
      {
        agent: "platform_adapter",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.8,
        maxTokens: 1500,
      },
      (raw) => sanitizePlatformResult(raw),
    );

    await this.logger?.log({
      agent: "platform_adapter",
      input: { topic: brief.topic, platforms: platforms.join(",") },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizePlatformResult(raw: unknown): PlatformAdapterResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const variantsArr = Array.isArray(obj.variants) ? obj.variants : [];
  const variants: PlatformVariant[] = variantsArr
    .map((v) => {
      const item = (v ?? {}) as Record<string, unknown>;
      const platform = String(item.platform ?? "TikTok") as ContentPlatform;
      const validPlatform: ContentPlatform = ["TikTok", "Instagram", "Threads"].includes(platform)
        ? platform
        : "TikTok";
      return {
        platform: validPlatform,
        text: String(item.text ?? "").trim().slice(0, 2000),
        format: String(item.format ?? "").trim().slice(0, 200),
        cta: String(item.cta ?? "").trim().slice(0, 200),
        visualNotes: String(item.visualNotes ?? "").trim().slice(0, 500),
        platformConstraints: Array.isArray(item.platformConstraints)
          ? item.platformConstraints.map(String).filter(Boolean).slice(0, 5)
          : [],
      };
    })
    .filter((v) => v.text);

  return { variants };
}
