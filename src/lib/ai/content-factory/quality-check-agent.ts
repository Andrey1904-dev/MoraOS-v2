/**
 * Quality Check Agent — проверяет качество и структуру контента.
 *
 * Проверяет:
 * - наличие всех обязательных частей сценария;
 * - повторения и бессмысленные фразы;
 * - клише и шаблонность;
 * - соответствие выбранному формату;
 * - наличие CTA, если он нужен;
 * - длину текста;
 * - запрещённые или рискованные утверждения;
 * - корректность структурированного результата.
 *
 * НЕ использует один AI-запрос, который одновременно генерирует,
 * проверяет и сам себе выставляет идеальную оценку.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import { buildFactorySystemPrompt, MARA_BIBLE } from "../character-bible";
import type { ScriptResult, CaptionAgentResult, QualityCheckResult, ContentBrief } from "./types";

export class QualityCheckAgent {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger?: AiRunLogger,
  ) {}

  async check(
    brief: ContentBrief,
    script: ScriptResult,
    captions: CaptionAgentResult | undefined,
    characterContext: CharacterContext,
  ): Promise<QualityCheckResult> {
    const start = Date.now();
    const systemPrompt = buildFactorySystemPrompt(characterContext, MARA_BIBLE);

    const scriptText = [
      script.hook,
      script.setup,
      ...script.mainBeats.map((b) => `[${b.label}] ${b.text}`),
      script.emotionalTurn,
      script.ending,
      `CTA: ${script.cta}`,
    ].join("\n");

    const captionTexts = captions?.captions.map((c) => `[${c.style}] ${c.text}`).join("\n") ?? "";

    const isVideo = ["Short Video", "Reel", "TikTok"].includes(brief.format);

    const prompt = [
      "You are the Quality Checker for content produced by the Mara OS Content Factory.",
      "You did NOT generate this content — you are reviewing it independently.",
      "",
      `Format: ${brief.format}`,
      `Platform: ${brief.platform}`,
      "",
      "Check the following:",
      "1. Are all required script parts present? (hook, setup, main beats, emotional turn, ending, CTA)",
      "2. Are there repeated phrases or meaningless filler?",
      "3. Is there cliché or template-like language?",
      "4. Does it match the chosen format? (video scripts need visual direction, text posts need concise copy)",
      "5. Is there a CTA? Is it appropriate for the platform?",
      isVideo ? `6. Is the estimated duration reasonable for the format? (${brief.format})` : "",
      "7. Are there any risky or forbidden claims?",
      "8. Is the structure well-organized?",
      "",
      "Script:",
      scriptText.slice(0, 2500),
      "",
      captionTexts ? `Captions:\n${captionTexts.slice(0, 1500)}` : "",
      "",
      "Score 0-100. Score below 50 with errors = not passed.",
      "Provide specific, actionable suggestions — not generic 'improve quality' advice.",
      "",
      'Return JSON: { "passed": boolean, "score": number, "issues": [{ "severity": "error"|"warning"|"info", "message": string, "field"?: string }], "suggestions": string[], "blockingReason"?: string }',
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.provider.generateStructured<QualityCheckResult>(
      {
        agent: "quality_check",
        system: systemPrompt,
        prompt,
        schema: { type: "object" },
        temperature: 0.3,
        maxTokens: 1000,
      },
      (raw) => sanitizeQualityResult(raw),
    );

    await this.logger?.log({
      agent: "quality_check",
      input: { format: brief.format, platform: brief.platform, scriptLength: scriptText.length },
      output: result.data,
      status: "success",
      model: result.model,
      durationMs: Date.now() - start || result.durationMs,
    });

    return result.data;
  }
}

function sanitizeQualityResult(raw: unknown): QualityCheckResult {
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
  const blockingReason = hasErrors && !passed
    ? typeof obj.blockingReason === "string"
      ? obj.blockingReason.slice(0, 300)
      : "Content has errors that must be resolved before saving as draft."
    : undefined;

  return {
    passed: passed && !hasErrors,
    score,
    issues,
    suggestions,
    blockingReason,
  };
}
