/**
 * Content Factory — публичный вход для конвейера генерации контента.
 */
export { ContentFactoryPipeline } from "./pipeline";
export { StrategyAgent } from "./strategy-agent";
export { HookAgent } from "./hook-agent";
export { ScriptAgent } from "./script-agent";
export { PlatformAdapterAgent } from "./platform-adapter";
export { CaptionAgent } from "./caption-agent";
export { CharacterCheckAgent } from "./character-check-agent";
export { QualityCheckAgent } from "./quality-check-agent";
export { MARA_BIBLE, buildCharacterContext, buildFactorySystemPrompt } from "../character-bible";
export type { CharacterBible } from "../character-bible";
export type {
  ContentBrief,
  ContentFormat,
  ContentPlatform,
  ContentIdea,
  StrategyAgentResult,
  HookVariant,
  HookAgentResult,
  ScriptBeat,
  ScriptResult,
  PlatformVariant,
  PlatformAdapterResult,
  CaptionVariant,
  CaptionAgentResult,
  CheckIssue,
  CharacterCheckResult,
  QualityCheckResult,
  PipelineStep,
  PipelineStatus,
  PipelineState,
  ContentFactoryDraft,
} from "./types";
export { DEFAULT_BRIEF } from "./types";
