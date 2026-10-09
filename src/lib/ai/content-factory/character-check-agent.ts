/**
 * Character Check Agent — проверяет соответствие контента характеру Mara.
 *
 * Проверяет:
 * - соответствие голосу Mara;
 * - согласованность с биографией и сюжетной линией;
 * - отсутствие противоречий предыдущим эпизодам;
 * - соответствие публичному образу;
 * - прозрачность вымышленного AI-персонажа;
 * - отсутствие необоснованных утверждений о реальных событиях.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ScriptResult, CharacterCheckResult, CaptionAgentResult } from "./types";

export class CharacterCheckAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async check(
    script: ScriptResult,
    captions: CaptionAgentResult | undefined,
    characterContext: CharacterContext,
  ): Promise<CharacterCheckResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);

    const allText = [
      script.hook,
      script.setup,
      ...script.mainBeats.map((b) => b.text),
      script.emotionalTurn,
      script.ending,
      script.caption,
      ...(captions?.captions.map((c) => c.text) ?? []),
    ].join("\n\n---\n\n");

    const prompt = [
      "You are the Character Consistency Checker for a fictional virtual AI-creator named Mara Quinn.",
      "",
      "Check the following content against the character bible:",
      "",
      "1. Does it match Mara's voice? (dry, confident, playful, first-person diary)",
      "2. Is it consistent with her biography? ($54k salary, $27k debt, Chicago, marketing coordinator)",
      "3. Are there contradictions with the storyline? (365 days, red notebook)",
      "4. Does it match the public persona? (not too vulnerable, not too corporate)",
      "5. Does it maintain transparency about being a fictional virtual AI-creator where needed?",
      "6. Are there unfounded claims about real events or real people?",
      "7. Any corporate language or AI assistant phrasing?",
      "",
      "Be strict but fair. A warning does not block publication — an error does.",
      "",
      "Content to check:",
      allText.slice(0, 4000),
      "",
      'Return JSON: { "passed": boolean, "score": number (0-100), "issues": [{ "severity": "error"|"warning"|"info", "message": string, "field"?: string }], "suggestions": string[] }',
    ]
      .join("\n");

    const result = await this.provider.generateStructured<CharacterCheckResult>(
      {
        agent: "character_check",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.3,
        maxTokens: 1000,
      },
      (raw) => sanitizeCheckResult(raw),
    );

    await this.logger?.log({
      agent: "character_check",
      input: { textLength: allText.length },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeCheckResult(raw: unknown): CharacterCheckResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const issuesArr = Array.isArray(obj.issues) ? obj.issues : [];
  const issues = issuesArr
    .map((i) => {
      const item = (i ?? {}) as Record<string, unknown>;
      const severity = ["error", "warning", "info"].includes(String(item.severity))
        ? (item.severity as "error" | "warning" | "info")
        : "warning";
      return {
        severity,
        message: String(item.message ?? "").trim().slice(0, 300),
        field: typeof item.field === "string" ? item.field.slice(0, 80) : undefined,
      };
    })
    .filter((i) => i.message);

  const suggestionsArr = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const suggestions = suggestionsArr.map(String).filter(Boolean).slice(0, 5);

  const score = typeof obj.score === "number" ? Math.min(100, Math.max(0, Math.round(obj.score))) : 50;
  const hasErrors = issues.some((i) => i.severity === "error");
  const passed = typeof obj.passed === "boolean" ? obj.passed : !hasErrors;

  return {
    passed: passed && !hasErrors,
    score,
    issues,
    suggestions,
  };
}
