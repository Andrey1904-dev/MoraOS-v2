/**
 * Content Strategy Agent — генерирует идеи контента с разными углами подачи.
 *
 * Учитывает текущую сюжетную арку, предыдущие публикации, Character Bible.
 * Не повторяет недавно использованные идеи без причины.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ContentBrief, ContentIdea, StrategyAgentResult } from "./types";

export class StrategyAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async generateIdeas(
    brief: ContentBrief,
    characterContext: import("../types").CharacterContext,
    recentTitles: string[] = [],
  ): Promise<StrategyAgentResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);

    const avoidBlock = recentTitles.length
      ? `\nDo NOT repeat these existing titles:\n${recentTitles.slice(0, 10).map((t) => `- ${t}`).join("\n")}`
      : "\nNo existing titles — any direction is fresh.";

    const prompt = [
      `Topic: ${brief.topic}`,
      brief.goal ? `Goal: ${brief.goal}` : "",
      brief.audience ? `Audience: ${brief.audience}` : "",
      `Platform: ${brief.platform}`,
      `Format: ${brief.format}`,
      brief.mood ? `Mood: ${brief.mood}` : "",
      brief.episodeId ? `Episode link: ${brief.episodeId}` : "",
      brief.storyElements?.length ? `Story elements: ${brief.storyElements.join(", ")}` : "",
      avoidBlock,
      "",
      "Propose 5 content ideas with DIFFERENT angles. Include at least one experimental/unexpected angle.",
      "For each idea: title, angle description, purpose (why this works), whether it links to an episode, whether it's experimental.",
      "",
      "Return JSON: { \"ideas\": [{ \"id\": \"idea_1\", \"title\": string, \"angle\": string, \"purpose\": string, \"episodeLink\": string|null, \"experimental\": boolean }], \"reasoning\": string }",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<StrategyAgentResult>(
      {
        agent: "strategy",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.85,
        maxTokens: 1200,
      },
      (raw) => sanitizeStrategyResult(raw),
    );

    await this.logger?.log({
      agent: "strategy",
      input: { topic: brief.topic, platform: brief.platform, format: brief.format },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeStrategyResult(raw: unknown): StrategyAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const ideasArr = Array.isArray(obj.ideas) ? obj.ideas : [];
  const ideas: ContentIdea[] = ideasArr
    .map((item, idx) => {
      const i = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(i.id ?? `idea_${idx + 1}`),
        title: String(i.title ?? "").trim().slice(0, 200),
        angle: String(i.angle ?? "").trim().slice(0, 300),
        purpose: String(i.purpose ?? "").trim().slice(0, 300),
        episodeLink: typeof i.episodeLink === "string" ? i.episodeLink : undefined,
        experimental: Boolean(i.experimental),
      };
    })
    .filter((i) => i.title)
    .slice(0, 7);

  return {
    ideas: ideas.length ? ideas : [{ id: "idea_1", title: "Untitled idea", angle: "General", purpose: "Needs refinement", experimental: false }],
    reasoning: String(obj.reasoning ?? "").trim().slice(0, 500),
  };
}
