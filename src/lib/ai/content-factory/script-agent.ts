/**
 * Script Agent — создаёт структурированный сценарий видео/публикации.
 *
 * Структура: Hook, Setup, Main Beats, Emotional Turn, Ending, CTA,
 * Visual Direction, On-screen Text, Caption.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ContentBrief, ContentIdea, HookVariant, ScriptResult } from "./types";

export class ScriptAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async generateScript(
    brief: ContentBrief,
    idea: ContentIdea,
    hook: HookVariant,
    characterContext: CharacterContext,
  ): Promise<ScriptResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);
    const isVideo = ["Short Video", "Reel", "TikTok"].includes(brief.format);

    const prompt = [
      `Topic: ${brief.topic}`,
      `Selected idea: "${idea.title}"`,
      `Selected hook: "${hook.text}" (type: ${hook.type})`,
      `Format: ${brief.format}`,
      `Platform: ${brief.platform}`,
      brief.mood ? `Mood: ${brief.mood}` : "",
      brief.cta ? `Desired CTA: ${brief.cta}` : "",
      "",
      "Create a structured script with these sections:",
      "- hook: Opening line (use the selected hook or improve it)",
      "- setup: Context/scene setting (1-2 sentences)",
      "- mainBeats: 3-5 key moments, each with label, text, optional visualDirection",
      "- emotionalTurn: The moment the content shifts emotionally",
      "- ending: Closing line",
      "- cta: Call to action",
      "- visualDirection: Overall visual guidance",
      "- onScreenText: Array of text overlays for video (empty for text posts)",
      "- caption: Short caption for the post",
      isVideo ? "- estimatedDurationSec: Estimated video length in seconds" : "",
      "",
      "Do NOT claim a video is created — this is a text script only.",
      "",
      'Return JSON matching the schema above.',
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<ScriptResult>(
      {
        agent: "script",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.75,
        maxTokens: 1500,
      },
      (raw) => sanitizeScriptResult(raw, isVideo),
    );

    await this.logger?.log({
      agent: "script",
      input: { topic: brief.topic, ideaId: idea.id, hookId: hook.id },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeScriptResult(raw: unknown, isVideo: boolean): ScriptResult {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const beatsArr = Array.isArray(obj.mainBeats) ? obj.mainBeats : [];
  const mainBeats = beatsArr
    .map((b) => {
      const beat = (b ?? {}) as Record<string, unknown>;
      return {
        label: String(beat.label ?? "Beat").trim().slice(0, 80),
        text: String(beat.text ?? "").trim().slice(0, 500),
        durationSec: typeof beat.durationSec === "number" ? beat.durationSec : undefined,
        visualDirection: typeof beat.visualDirection === "string" ? beat.visualDirection.slice(0, 200) : undefined,
      };
    })
    .filter((b) => b.text)
    .slice(0, 7);

  const onScreen = Array.isArray(obj.onScreenText)
    ? obj.onScreenText.map(String).filter(Boolean).slice(0, 8)
    : [];

  const estimatedDuration = isVideo
    ? Math.min(120, Math.max(15, Number(obj.estimatedDurationSec) || 30))
    : 0;

  return {
    hook: String(obj.hook ?? "").trim().slice(0, 300) || "No hook",
    setup: String(obj.setup ?? "").trim().slice(0, 500),
    mainBeats: mainBeats.length ? mainBeats : [{ label: "Main", text: String(obj.mainBeats ?? "").slice(0, 500) || "Content body" }],
    emotionalTurn: String(obj.emotionalTurn ?? "").trim().slice(0, 500),
    ending: String(obj.ending ?? "").trim().slice(0, 300),
    cta: String(obj.cta ?? "Follow for more").trim().slice(0, 200),
    visualDirection: String(obj.visualDirection ?? "").trim().slice(0, 500),
    onScreenText: onScreen,
    caption: String(obj.caption ?? "").trim().slice(0, 500),
    estimatedDurationSec: estimatedDuration,
  };
}
