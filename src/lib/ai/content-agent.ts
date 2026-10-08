import type { AIProvider } from "./provider";
import { CharacterAgent } from "./character-agent";
import type { AiRunLogger, ContentAgentInput, ContentAgentResult } from "./types";

/**
 * Content Agent — идеи, хуки, подписи, сценарии и A/B-варианты контента
 * в рамках текущей сюжетной арки Mara.
 */
export class ContentAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly characterAgent = new CharacterAgent(),
    private readonly logger?: AiRunLogger,
  ) {}

  async generate(input: ContentAgentInput): Promise<ContentAgentResult> {
    const start = Date.now();
    const result = await this.provider.generateStructured<ContentAgentResult>(
      {
        agent: "content",
        system: this.characterAgent.systemPrompt(input.character),
        prompt: [
          `Platform: ${input.platform}`,
          `Content type: ${input.contentType}`,
          input.theme ? `Theme: ${input.theme}` : "",
          input.episodeTitle ? `Episode: ${input.episodeTitle}` : "",
          "",
          "Create 3 hooks, one caption, one CTA and 2 A/B variants. JSON only.",
        ]
          .filter(Boolean)
          .join("\n"),
        schema: { type: "object" },
        temperature: 0.8,
        maxTokens: 600,
      },
      (raw) => sanitizeContentResult(raw),
    );

    await this.logger?.log({
      agent: "content",
      input: { platform: input.platform, contentType: input.contentType, theme: input.theme ?? null },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeContentResult(raw: unknown): ContentAgentResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hooks = Array.isArray(obj.hooks) ? obj.hooks.map(String).filter(Boolean).slice(0, 5) : [];
  const variants = Array.isArray(obj.variants)
    ? obj.variants
        .map((v) => {
          const o = (v ?? {}) as Record<string, unknown>;
          return { angle: String(o.angle ?? "variant"), hook: String(o.hook ?? "") };
        })
        .filter((v) => v.hook)
        .slice(0, 4)
    : [];
  return {
    hooks: hooks.length ? hooks : ["Untitled hook"],
    caption: typeof obj.caption === "string" ? obj.caption.trim() : "",
    cta: typeof obj.cta === "string" ? obj.cta.trim() : "Follow the storyline",
    variants,
  };
}
