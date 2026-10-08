/**
 * Общие типы слоя AI-агентов Mara OS.
 *
 * Агенты получают структурированный контекст (не сырые строки) и возвращают
 * структурированный результат — так их можно проверять, логировать (ai_runs)
 * и прогонять через human approval без разбора свободного текста.
 */

export type RelationshipLevelKey =
  | "visitor"
  | "follower"
  | "regular"
  | "fan"
  | "favorite"
  | "inner_circle";

export interface CharacterContext {
  name: string;
  voice: string;
  story: string;
  lore?: string;
  boundaries: string[];
  personality: string[];
  recurringObjects: string[];
}

export interface FanContext {
  id: string;
  name: string;
  relationshipLevel: RelationshipLevelKey;
  ltv: number;
  purchases: number;
  hasActiveSubscription: boolean;
  source: string;
}

export interface MemoryFact {
  memory: string;
  category: string;
  importance: number;
}

export interface ConversationTurn {
  author: "fan" | "mara" | "system";
  body: string;
  at?: string;
}

/* --------------------------- Conversation Agent --------------------------- */

export interface ConversationAgentInput {
  character: CharacterContext;
  fan: FanContext;
  memories: MemoryFact[];
  history: ConversationTurn[];
  recentPurchases?: number;
  hasActiveSubscription?: boolean;
}

export interface ConversationAgentResult {
  reply: string;
  intent:
    | "greeting"
    | "flirting"
    | "price_check"
    | "story_followup"
    | "support"
    | "smalltalk"
    | "other";
  sales_action: "none" | "recommend_offer" | "wait" | "nurture";
  memory_candidate: { memory: string; category: string; importance: number } | null;
  relationship_level: RelationshipLevelKey;
  confidence: number;
}

/* ------------------------------- Memory Agent ------------------------------- */

export interface MemoryAgentInput {
  history: ConversationTurn[];
  existingMemories: MemoryFact[];
}

export interface MemoryAgentResult {
  memory: string | null;
  category?: string;
  importance?: number;
}

/* -------------------------------- Sales Agent ------------------------------ */

export interface SalesAgentInput {
  fan: FanContext;
  recentMessages: ConversationTurn[];
  offers: { id: string; name: string; price: number; type: string }[];
}

export interface SalesAgentResult {
  action: "sell_now" | "wait" | "nurture" | "recommend_offer" | "no_sales";
  offer_id: string | null;
  reason: string;
  confidence: number;
}

/* ------------------------------- Content Agent ----------------------------- */

export interface ContentAgentInput {
  character: CharacterContext;
  platform: string;
  contentType: string;
  theme?: string;
  episodeTitle?: string;
}

export interface ContentAgentResult {
  hooks: string[];
  caption: string;
  cta: string;
  variants: { angle: string; hook: string }[];
}

/* ------------------------------ Analytics Agent ---------------------------- */

export interface AnalyticsAgentInput {
  metrics: { key: string; label: string; value: string; delta: number }[];
  topContent?: { title: string; views: number; platform: string }[];
  funnel?: { label: string; value: number }[];
}

export interface AnalyticsAgentResult {
  insights: {
    kind: "insight" | "recommendation" | "risk";
    title: string;
    body: string;
    recommendation: string;
    confidence: number;
  }[];
}

/* --------------------------------- Логирование ---------------------------- */

/** Приёмник записей ai_runs (в UI — репозиторий, на сервере — прямая запись). */
export interface AiRunLogger {
  log(entry: {
    agent: string;
    input: unknown;
    output: unknown;
    status: "success" | "error";
    model: string;
    durationMs: number;
  }): Promise<void>;
}
