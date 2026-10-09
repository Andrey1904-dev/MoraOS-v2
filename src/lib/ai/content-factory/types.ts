/**
 * Типы Content Factory — конвейера генерации контента Mara OS.
 *
 * Каждый этап конвейера получает структурированный вход, возвращает
 * структурированный результат, сохраняет статус и связь с исходным заданием.
 */

/* -------------------------------- Brief ---------------------------------- */

export type ContentFormat =
  | "Short Video"
  | "Reel"
  | "TikTok"
  | "Threads Post"
  | "Photo Caption"
  | "Story"
  | "Episode Teaser"
  | "Multi-Post Series";

export type ContentPlatform = "TikTok" | "Instagram" | "Threads";

export interface ContentBrief {
  topic: string;
  goal?: string;
  audience?: string;
  platform: ContentPlatform;
  format: ContentFormat;
  mood?: string;
  episodeId?: string;
  storyElements?: string[];
  cta?: string;
  language?: string;
  constraints?: string[];
}

export const DEFAULT_BRIEF: Omit<ContentBrief, "topic"> = {
  platform: "TikTok",
  format: "Short Video",
  language: "English",
};

/* -------------------------------- Idea ----------------------------------- */

export interface ContentIdea {
  id: string;
  title: string;
  angle: string;
  purpose: string;
  episodeLink?: string;
  experimental: boolean;
}

export interface StrategyAgentResult {
  ideas: ContentIdea[];
  reasoning: string;
}

/* -------------------------------- Hook ----------------------------------- */

export interface HookVariant {
  id: string;
  text: string;
  type: string;
  audienceInterest: "low" | "medium" | "high";
  topicRelevance: "low" | "medium" | "high";
  clicheRisk: "low" | "medium" | "high";
  recommendation: string;
}

export interface HookAgentResult {
  hooks: HookVariant[];
}

/* -------------------------------- Script --------------------------------- */

export interface ScriptBeat {
  label: string;
  text: string;
  durationSec?: number;
  visualDirection?: string;
}

export interface ScriptResult {
  hook: string;
  setup: string;
  mainBeats: ScriptBeat[];
  emotionalTurn: string;
  ending: string;
  cta: string;
  visualDirection: string;
  onScreenText: string[];
  caption: string;
  estimatedDurationSec: number;
}

/* --------------------------- Platform Variant ---------------------------- */

export interface PlatformVariant {
  platform: ContentPlatform;
  text: string;
  format: string;
  cta: string;
  visualNotes: string;
  platformConstraints: string[];
}

export interface PlatformAdapterResult {
  variants: PlatformVariant[];
}

/* -------------------------------- Caption -------------------------------- */

export interface CaptionVariant {
  style: "short" | "extended" | "conversational" | "story" | "engagement";
  text: string;
}

export interface CaptionAgentResult {
  captions: CaptionVariant[];
}

/* ------------------------------ Checks ----------------------------------- */

export interface CheckIssue {
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
}

export interface CharacterCheckResult {
  passed: boolean;
  score: number;
  issues: CheckIssue[];
  suggestions: string[];
}

export interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: CheckIssue[];
  suggestions: string[];
  blockingReason?: string;
}

/* ---------------------------- Pipeline State ----------------------------- */

export type PipelineStep =
  | "brief"
  | "ideas"
  | "hooks"
  | "script"
  | "platform_variants"
  | "captions"
  | "character_check"
  | "quality_check"
  | "draft"
  | "approved";

export type PipelineStatus = "pending" | "running" | "completed" | "failed" | "waiting_approval";

export interface PipelineState {
  id: string;
  brief: ContentBrief;
  currentStep: PipelineStep;
  status: PipelineStatus;
  ideas?: StrategyAgentResult;
  selectedIdeaId?: string;
  hooks?: HookAgentResult;
  script?: ScriptResult;
  platformVariants?: PlatformAdapterResult;
  captions?: CaptionAgentResult;
  characterCheck?: CharacterCheckResult;
  qualityCheck?: QualityCheckResult;
  contentId?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

/* --------------------------- Factory Output ------------------------------ */

export interface ContentFactoryDraft {
  title: string;
  description: string;
  hook: string;
  caption: string;
  script: string;
  cta: string;
  platform: string;
  type: string;
  episodeId?: string;
  status: "Draft";
}
