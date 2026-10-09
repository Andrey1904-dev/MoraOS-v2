/**
 * Content Factory Pipeline — оркестратор полного конвейера генерации.
 *
 * Brief → Ideas → Hooks → Script → Platform Variants → Captions →
 * Character Check → Quality Check → Draft
 *
 * Каждый этап сохраняет результат в PipelineState, статус и ошибки.
 * Поддерживает повторный запуск отдельного этапа без потери
 * предыдущих результатов.
 */

import type { AIProvider } from "../provider";
import type { AiRunLogger, CharacterContext } from "../types";
import type {
  ContentBrief,
  ContentIdea,
  HookVariant,
  PipelineState,
  PipelineStep,
  ContentFactoryDraft,
} from "./types";
import { StrategyAgent } from "./strategy-agent";
import { HookAgent } from "./hook-agent";
import { ScriptAgent } from "./script-agent";
import { PlatformAdapterAgent } from "./platform-adapter";
import { CaptionAgent } from "./caption-agent";
import { CharacterCheckAgent } from "./character-check-agent";
import { QualityCheckAgent } from "./quality-check-agent";

export class ContentFactoryPipeline {
  private readonly strategyAgent: StrategyAgent;
  private readonly hookAgent: HookAgent;
  private readonly scriptAgent: ScriptAgent;
  private readonly platformAdapterAgent: PlatformAdapterAgent;
  private readonly captionAgent: CaptionAgent;
  private readonly characterCheckAgent: CharacterCheckAgent;
  private readonly qualityCheckAgent: QualityCheckAgent;

  constructor(
    readonly provider: AIProvider,
    readonly logger?: AiRunLogger,
  ) {
    this.strategyAgent = new StrategyAgent(provider, logger);
    this.hookAgent = new HookAgent(provider, logger);
    this.scriptAgent = new ScriptAgent(provider, logger);
    this.platformAdapterAgent = new PlatformAdapterAgent(provider, logger);
    this.captionAgent = new CaptionAgent(provider, logger);
    this.characterCheckAgent = new CharacterCheckAgent(provider, logger);
    this.qualityCheckAgent = new QualityCheckAgent(provider, logger);
  }

  createPipelineState(brief: ContentBrief): PipelineState {
    return {
      id: `pipeline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      brief,
      currentStep: "brief",
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async generateIdeas(
    state: PipelineState,
    characterContext: CharacterContext,
    recentTitles: string[] = [],
  ): Promise<PipelineState> {
    const updated = this.startStep(state, "ideas");
    try {
      const result = await this.strategyAgent.generateIdeas(updated.brief, characterContext, recentTitles);
      return this.completeStep({ ...updated, ideas: result }, "ideas");
    } catch (error) {
      return this.failStep(updated, "ideas", error);
    }
  }

  async generateHooks(
    state: PipelineState,
    idea: ContentIdea,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    const updated = this.startStep(state, "hooks");
    try {
      const result = await this.hookAgent.generateHooks(updated.brief, idea, characterContext);
      return this.completeStep({ ...updated, hooks: result }, "hooks");
    } catch (error) {
      return this.failStep(updated, "hooks", error);
    }
  }

  async generateScript(
    state: PipelineState,
    idea: ContentIdea,
    hook: HookVariant,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    const updated = this.startStep(state, "script");
    try {
      const result = await this.scriptAgent.generateScript(updated.brief, idea, hook, characterContext);
      return this.completeStep({ ...updated, script: result, selectedIdeaId: idea.id }, "script");
    } catch (error) {
      return this.failStep(updated, "script", error);
    }
  }

  async generatePlatformVariants(
    state: PipelineState,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    if (!state.script) throw new Error("Cannot generate platform variants without a script");
    const updated = this.startStep(state, "platform_variants");
    try {
      const result = await this.platformAdapterAgent.adaptForPlatforms(
        updated.brief,
        updated.script!,
        characterContext,
      );
      return this.completeStep({ ...updated, platformVariants: result }, "platform_variants");
    } catch (error) {
      return this.failStep(updated, "platform_variants", error);
    }
  }

  async generateCaptions(
    state: PipelineState,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    if (!state.script) throw new Error("Cannot generate captions without a script");
    const updated = this.startStep(state, "captions");
    try {
      const result = await this.captionAgent.generateCaptions(
        updated.brief,
        updated.script!,
        characterContext,
      );
      return this.completeStep({ ...updated, captions: result }, "captions");
    } catch (error) {
      return this.failStep(updated, "captions", error);
    }
  }

  async runCharacterCheck(
    state: PipelineState,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    if (!state.script) throw new Error("Cannot check character without a script");
    const updated = this.startStep(state, "character_check");
    try {
      const result = await this.characterCheckAgent.check(
        updated.script!,
        updated.captions,
        characterContext,
      );
      return this.completeStep({ ...updated, characterCheck: result }, "character_check");
    } catch (error) {
      return this.failStep(updated, "character_check", error);
    }
  }

  async runQualityCheck(
    state: PipelineState,
    characterContext: CharacterContext,
  ): Promise<PipelineState> {
    if (!state.script) throw new Error("Cannot check quality without a script");
    const updated = this.startStep(state, "quality_check");
    try {
      const result = await this.qualityCheckAgent.check(
        updated.brief,
        updated.script!,
        updated.captions,
        characterContext,
      );
      return this.completeStep({ ...updated, qualityCheck: result }, "quality_check");
    } catch (error) {
      return this.failStep(updated, "quality_check", error);
    }
  }

  /**
   * Builds a ContentFactoryDraft from the pipeline state.
   * Called only after checks pass or user explicitly approves.
   */
  buildDraft(state: PipelineState): ContentFactoryDraft {
    if (!state.script) throw new Error("Cannot build draft without a script");

    const bestCaption = state.captions?.captions.find((c) => c.style === "short")?.text
      ?? state.captions?.captions[0]?.text
      ?? state.script.caption
      ?? "";

    const idea = state.ideas?.ideas.find((i) => i.id === state.selectedIdeaId);

    return {
      title: idea?.title ?? state.brief.topic.slice(0, 80),
      description: idea?.angle ?? state.brief.topic,
      hook: state.script.hook,
      caption: bestCaption,
      script: formatScriptForStorage(state.script),
      cta: state.script.cta,
      platform: state.brief.platform,
      type: isVideoFormat(state.brief.format) ? "Video" : "Text",
      episodeId: state.brief.episodeId,
      status: "Draft" as const,
    };
  }

  /**
   * Runs the full pipeline from brief to checks.
   * Stops at waiting_approval if checks fail.
   */
  async runFull(
    brief: ContentBrief,
    characterContext: CharacterContext,
    selectedIdeaId: string,
    selectedHookIdx: number,
    recentTitles: string[] = [],
  ): Promise<PipelineState> {
    let state = this.createPipelineState(brief);

    // Step 1: Ideas
    state = await this.generateIdeas(state, characterContext, recentTitles);
    if (state.status === "failed") return state;

    // Step 2: Select idea
    const selectedIdea = state.ideas?.ideas.find((i) => i.id === selectedIdeaId) ?? state.ideas?.ideas[0];
    if (!selectedIdea) return { ...state, status: "failed", error: "No ideas generated" };

    // Step 3: Hooks
    state = await this.generateHooks(state, selectedIdea, characterContext);
    if (state.status === "failed") return state;

    // Step 4: Select hook
    const selectedHook = state.hooks?.hooks[selectedHookIdx] ?? state.hooks?.hooks[0];
    if (!selectedHook) return { ...state, status: "failed", error: "No hooks generated" };

    // Step 5: Script
    state = await this.generateScript(state, selectedIdea, selectedHook, characterContext);
    if (state.status === "failed") return state;

    // Step 6: Platform variants
    state = await this.generatePlatformVariants(state, characterContext);
    if (state.status === "failed") return state;

    // Step 7: Captions
    state = await this.generateCaptions(state, characterContext);
    if (state.status === "failed") return state;

    // Step 8: Character check
    state = await this.runCharacterCheck(state, characterContext);
    if (state.status === "failed") return state;

    // Step 9: Quality check
    state = await this.runQualityCheck(state, characterContext);
    if (state.status === "failed") return state;

    // If checks failed, mark as waiting for approval
    if (state.characterCheck && !state.characterCheck.passed) {
      return { ...state, status: "waiting_approval", currentStep: "character_check" };
    }
    if (state.qualityCheck && !state.qualityCheck.passed) {
      return { ...state, status: "waiting_approval", currentStep: "quality_check" };
    }

    return { ...state, status: "completed", currentStep: "draft" };
  }

  /* ----------------------------- helpers -------------------------------- */

  private startStep(state: PipelineState, step: PipelineStep): PipelineState {
    return {
      ...state,
      currentStep: step,
      status: "running",
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  private completeStep(state: PipelineState, _step: PipelineStep): PipelineState {
    return {
      ...state,
      status: "pending",
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  private failStep(state: PipelineState, step: PipelineStep, error: unknown): PipelineState {
    if (state.retryCount >= state.maxRetries) {
      return {
        ...state,
        currentStep: step,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      ...state,
      currentStep: step,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      retryCount: state.retryCount + 1,
      updatedAt: new Date().toISOString(),
    };
  }
}

/* ---------------------------- utilities ---------------------------------- */

function isVideoFormat(format: string): boolean {
  return ["Short Video", "Reel", "TikTok"].includes(format);
}

function formatScriptForStorage(script: import("./types").ScriptResult): string {
  const lines: string[] = [];
  lines.push(`[HOOK] ${script.hook}`);
  lines.push(`[SETUP] ${script.setup}`);
  for (const beat of script.mainBeats) {
    lines.push(`[${beat.label.toUpperCase()}] ${beat.text}`);
    if (beat.visualDirection) lines.push(`  → Visual: ${beat.visualDirection}`);
  }
  if (script.emotionalTurn) lines.push(`[EMOTIONAL TURN] ${script.emotionalTurn}`);
  lines.push(`[ENDING] ${script.ending}`);
  lines.push(`[CTA] ${script.cta}`);
  if (script.visualDirection) lines.push(`\n[VISUAL DIRECTION] ${script.visualDirection}`);
  if (script.onScreenText.length) {
    lines.push(`\n[ON-SCREEN TEXT]`);
    for (const t of script.onScreenText) lines.push(`  • ${t}`);
  }
  if (script.estimatedDurationSec) {
    lines.push(`\n[ESTIMATED DURATION] ${script.estimatedDurationSec}s`);
  }
  return lines.join("\n");
}
