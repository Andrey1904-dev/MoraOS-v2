import type {
  Agent,
  AIInsight,
  Asset,
  Automation,
  Character,
  ContentItem,
  Conversation,
  Episode,
  Fan,
  FanEvent,
  Memory,
  Message,
  MetricSnapshot,
  Offer,
  Purchase,
  SeriesPoint,
  Task,
} from "@/types";

/**
 * Контракт слоя данных Mara OS.
 *
 * UI никогда не обращается к Supabase или localStorage напрямую —
 * только через эти интерфейсы. Две реализации:
 *   • demo.ts     — вымышленный датасет + локальные правки (демо-режим);
 *   • supabase.ts — настоящие таблицы проекта (облачный режим).
 */

export interface FanRepository {
  list(query?: { search?: string; segment?: string }): Promise<Fan[]>;
  get(id: string): Promise<Fan | null>;
  memories(fanId: string): Promise<Memory[]>;
  events(fanId: string): Promise<FanEvent[]>;
  purchases(fanId: string): Promise<Purchase[]>;
  addMemory(
    fanId: string,
    memory: { statement: string; category: Memory["category"]; confidence: number; source: string },
  ): Promise<Memory>;
  setRelationship(id: string, level: Fan["relationship"]): Promise<Fan | null>;
}

export interface SendMessageInput {
  body: string;
  author: "fan" | "mara";
  aiGenerated?: boolean;
}

export interface ConversationRepository {
  list(): Promise<Conversation[]>;
  messages(conversationId: string): Promise<Message[]>;
  /** Отправить одобренное сообщение (human approval уже получен в UI). */
  sendMessage(conversationId: string, input: SendMessageInput): Promise<Message>;
  /** Сохранить AI-черновик: ждёт Edit/Approve/Send в инбоксе. */
  saveDraft(conversationId: string, body: string, meta?: { tone?: string; intent?: string; confidence?: number }): Promise<Message>;
  /** Одобрить и отправить черновик. */
  approveDraft(conversationId: string, messageId: string, body?: string): Promise<Message>;
  markRead(conversationId: string): Promise<void>;
}

export interface ContentRepository {
  list(): Promise<ContentItem[]>;
  get(id: string): Promise<ContentItem | null>;
  episodes(): Promise<Episode[]>;
  assets(): Promise<Asset[]>;
  saveDraft(item: Partial<ContentItem> & { title: string }): Promise<ContentItem>;
  setStatus(id: string, status: ContentItem["status"]): Promise<ContentItem | null>;
}

export interface CommerceRepository {
  offers(): Promise<Offer[]>;
  revenueBySource(): Promise<SeriesPoint[]>;
  revenueByOffer(): Promise<SeriesPoint[]>;
  topSpenders(): Promise<
    { fanId: string; name: string; handle: string; amount: number; orders: number; last: string }[]
  >;
}

export interface AnalyticsRepository {
  metrics(period: string): Promise<MetricSnapshot[]>;
  revenue(period: string): Promise<SeriesPoint[]>;
  audience(period: string): Promise<SeriesPoint[]>;
  engagement(period: string): Promise<SeriesPoint[]>;
  funnel(): Promise<SeriesPoint[]>;
  retention(): Promise<SeriesPoint[]>;
  topContent(): Promise<
    { rank: number; title: string; views: number; followers: number; platform: ContentItem["platform"]; id: string }[]
  >;
}

export interface AiRunEntry {
  id: string;
  agent: string;
  input: unknown;
  output: unknown;
  status: "success" | "error";
  model: string;
  durationMs: number;
  createdAt: string;
}

export interface AIRepository {
  agents(): Promise<Agent[]>;
  insights(): Promise<AIInsight[]>;
  automations(): Promise<Automation[]>;
  tasks(): Promise<Task[]>;
  runs(limit?: number): Promise<AiRunEntry[]>;
  logRun(entry: Omit<AiRunEntry, "id" | "createdAt">): Promise<void>;
  setAutomationStatus(id: string, status: Automation["status"]): Promise<Automation | null>;
  recordAutomationRun(id: string): Promise<Automation | null>;
  setTaskStatus(id: string, status: Task["status"]): Promise<Task | null>;
  addTask(task: Pick<Task, "title" | "detail" | "priority" | "group" | "due"> & { source?: string }): Promise<Task>;
}

export interface CharacterRepository {
  get(): Promise<Character>;
  update(patch: Partial<Character>): Promise<Character>;
}

export interface Repositories {
  fans: FanRepository;
  conversations: ConversationRepository;
  content: ContentRepository;
  commerce: CommerceRepository;
  analytics: AnalyticsRepository;
  ai: AIRepository;
  character: CharacterRepository;
}
