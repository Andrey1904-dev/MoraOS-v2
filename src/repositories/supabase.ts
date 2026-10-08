import { getSupabase } from "@/lib/supabase";
import type { FanDossier } from "@/lib/export";
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
  Platform,
  Purchase,
  SeriesPoint,
  Task,
  Offer,
} from "@/types";
import type { Database } from "@/types/database.types";
import type {
  AIRepository,
  AiRunEntry,
  AnalyticsRepository,
  CharacterRepository,
  CommerceRepository,
  ContentRepository,
  ConversationRepository,
  FanRepository,
  Repositories,
  SendMessageInput,
} from "./types";

/**
 * Облачные репозитории Mara OS поверх Supabase.
 *
 * Все запросы идут от имени текущего пользователя (RLS фильтрует строки
 * по user_id сам, явный фильтр не нужен). Мапперы переводят snake_case
 * строки БД в презентационные типы UI — компоненты не видят схему.
 */

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type FanRow = Row<"fans">;
type ConversationRow = Row<"conversations">;
type MessageRow = Row<"messages">;
type ContentRow = Row<"content">;
type EpisodeRow = Row<"episodes">;
type AssetRow = Row<"assets">;
type OfferRow = Row<"offers">;
type PurchaseRow = Row<"purchases">;
type SubscriptionRow = Row<"subscriptions">;
type RevenueRow = Row<"revenue_events">;
type TaskRow = Row<"tasks">;
type AutomationRow = Row<"automations">;
type InsightRow = Row<"ai_insights">;

const db = () => getSupabase();

/** Сколько id передаём в один фильтр in.(): длинный URL PostgREST не принимает. */
const IN_CHUNK = 100;

/**
 * Запрос с фильтром `in.()` разбивается на куски по IN_CHUNK id и собирается
 * в один массив. Раньше 1000 фанов давали URL около 40 КБ и падение запроса.
 */
async function inChunks<T>(
  values: readonly string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const { data, error } = await run(values.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/* ------------------------------ enum mappers ------------------------------ */

const REL_TO_UI: Record<FanRow["relationship_level"], Fan["relationship"]> = {
  visitor: "Visitor",
  follower: "Follower",
  regular: "Regular",
  fan: "Fan",
  favorite: "Favorite",
  inner_circle: "Inner circle",
};
const REL_TO_DB = Object.fromEntries(
  Object.entries(REL_TO_UI).map(([db, ui]) => [ui, db]),
) as Record<Fan["relationship"], FanRow["relationship_level"]>;

const STATUS_TO_UI: Record<FanRow["status"], Fan["status"]> = {
  active: "Active",
  new: "New",
  inactive: "Sleeping",
  churn_risk: "Churn risk",
  churned: "Churned",
};

const PLATFORM_TO_UI: Record<string, Fan["source"]> = {
  telegram: "Telegram",
  fanvue: "Fanvue",
  instagram: "Instagram",
  tiktok: "TikTok",
  threads: "Threads",
  manual: "Telegram",
  reddit: "Reddit",
  youtube: "YouTube",
};

const CSTATUS_TO_UI: Record<ContentRow["status"], ContentItem["status"]> = {
  idea: "Idea",
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};
const CSTATUS_TO_DB = Object.fromEntries(
  Object.entries(CSTATUS_TO_UI).map(([db, ui]) => [ui, db]),
) as Record<ContentItem["status"], ContentRow["status"]>;

const CTYPE_TO_UI: Record<ContentRow["content_type"], ContentItem["type"]> = {
  photo: "Image",
  video: "Video",
  reel: "Video",
  short: "Video",
  story: "Story",
  post: "Text",
  carousel: "Image",
  thread: "Text",
  message: "Text",
  ppv: "Image",
};
const CTYPE_TO_DB: Record<ContentItem["type"], ContentRow["content_type"]> = {
  Image: "photo",
  Video: "video",
  Text: "post",
  Story: "story",
};

const ESTATUS_TO_UI: Record<EpisodeRow["status"], Episode["status"]> = {
  outline: "Outline",
  in_production: "In production",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Published",
};

const TSTATUS_TO_UI: Record<TaskRow["status"], Task["status"]> = {
  todo: "Todo",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Done",
};
const TSTATUS_TO_DB: Record<Task["status"], TaskRow["status"]> = {
  Todo: "todo",
  "In progress": "in_progress",
  Waiting: "waiting",
  Done: "done",
};

const TPRIORITY_TO_UI: Record<TaskRow["priority"], Task["priority"]> = {
  low: "Low",
  medium: "Normal",
  high: "High",
  urgent: "Urgent",
};
const TPRIORITY_TO_DB: Record<Task["priority"], TaskRow["priority"]> = {
  Low: "low",
  Normal: "medium",
  High: "high",
  Urgent: "urgent",
};

const PLATFORM_UI_TO_DB: Record<Platform, Database["public"]["Tables"]["content"]["Insert"]["platform"]> = {
  TikTok: "tiktok",
  Instagram: "instagram",
  Threads: "threads",
  Fanvue: "fanvue",
  Telegram: "telegram",
};

const OFFER_TO_UI: Record<OfferRow["type"], "PPV" | "Subscription" | "Tip" | "Bundle" | "VIP"> = {
  subscription: "Subscription",
  ppv: "PPV",
  bundle: "Bundle",
  vip: "VIP",
  custom: "Tip",
  telegram_vip: "VIP",
};

const OFFER_STATUS_TO_UI: Record<OfferRow["status"], Offer["status"]> = {
  live: "Live",
  paused: "Paused",
  draft: "Draft",
  archived: "Draft",
};

/**
 * «sent» в БД означает доставку фану. Приложение доставку пока не выполняет,
 * поэтому одобренные ответы получают статус «approved» и в интерфейсе не выдаются
 * за отправленные.
 */
const MSG_STATUS_TO_UI: Record<MessageRow["status"], NonNullable<Message["state"]>> = {
  sent: "sent",
  approved: "approved",
  draft: "draft",
  awaiting_approval: "awaiting_approval",
  failed: "failed",
};

const AUTOMATION_STATUS_TO_UI: Record<AutomationRow["status"], Automation["status"]> = {
  active: "Active",
  paused: "Paused",
  disabled: "Paused",
};
const AUTOMATION_STATUS_TO_DB: Record<Automation["status"], AutomationRow["status"]> = {
  Active: "active",
  Paused: "paused",
};

const MEMORY_CATEGORIES: Memory["category"][] = [
  "interests",
  "location",
  "content preference",
  "boundary",
  "lifestyle",
  "purchase habit",
];
const memoryCategory = (raw: string): Memory["category"] =>
  (MEMORY_CATEGORIES as string[]).includes(raw) ? (raw as Memory["category"]) : "lifestyle";

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fanSourceLabel = (p: string): Fan["source"] => PLATFORM_TO_UI[p] ?? "Telegram";
const contentPlatformLabel = (p: string): Platform => {
  const ui = PLATFORM_TO_UI[p];
  return ui === "TikTok" || ui === "Instagram" || ui === "Threads" || ui === "Fanvue" || ui === "Telegram"
    ? ui
    : "TikTok";
};
const avatarTone = (seed: string): string => {
  const tones = ["#8a5a4a", "#4a6a8a", "#6a5a8a", "#4a8a72", "#8a744a", "#8a4a6a", "#4a7a8a", "#5a5a8a"];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
};

const shortDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    : "—";

async function requireUserId(): Promise<string> {
  const { data, error } = await db().auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
}

/* ---------------------------------- Fans --------------------------------- */

interface SubscriptionEmbed {
  status: SubscriptionRow["status"];
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  offers: { name: string; price: number } | null;
}

/** Подписки и офферы собираются отдельными запросами: join через embed
    менее прозрачен для типов, а объёмы здесь небольшие. */
async function subscriptionsByFan(fanIds: string[]): Promise<Map<string, SubscriptionEmbed[]>> {
  const map = new Map<string, SubscriptionEmbed[]>();
  if (!fanIds.length) return map;
  const subs = await inChunks(fanIds, (chunk) =>
    db().from("subscriptions").select("*").in("fan_id", chunk).order("started_at", { ascending: false }),
  );
  const offerIds = [...new Set((subs ?? []).map((s) => s.offer_id).filter((x): x is string => Boolean(x)))];
  const offersById = new Map<string, { name: string; price: number }>();
  if (offerIds.length) {
    const offers = await inChunks(offerIds, (chunk) => db().from("offers").select("id, name, price").in("id", chunk));
    for (const o of offers ?? []) offersById.set(o.id, { name: o.name, price: Number(o.price) });
  }
  for (const s of subs ?? []) {
    const embed: SubscriptionEmbed = {
      status: s.status,
      started_at: s.started_at,
      expires_at: s.expires_at,
      cancelled_at: s.cancelled_at,
      offers: s.offer_id ? (offersById.get(s.offer_id) ?? null) : null,
    };
    map.set(s.fan_id, [...(map.get(s.fan_id) ?? []), embed]);
  }
  return map;
}

function mapFan(row: FanRow, subs: SubscriptionEmbed[]): Fan {
  const active = subs.find((s) => s.status === "active" || s.status === "paused");
  const cancelled = subs.find((s) => s.status === "cancelled");
  const sub = active ?? cancelled;
  return {
    id: row.id,
    name: row.display_name,
    handle: row.username || "@fan",
    avatarTone: avatarTone(row.id),
    source: fanSourceLabel(row.source),
    relationship: REL_TO_UI[row.relationship_level],
    status: STATUS_TO_UI[row.status],
    ltv: Number(row.lifetime_value),
    purchases: row.total_purchases,
    subscription: sub
      ? {
          plan: sub.offers ? `${sub.offers.name} · $${Number(sub.offers.price)}` : "Subscription",
          status: sub.status === "active" ? "Active" : sub.status === "paused" ? "Paused" : "Cancelled",
          renews: sub.status === "cancelled" ? "—" : shortDate(sub.expires_at),
        }
      : null,
    lastActivity: row.last_interaction_at ?? row.updated_at,
    location: row.location,
    joined: row.joined_at,
    spendTierNote: row.notes,
    tags: row.tags,
  };
}

class SupabaseFanRepository implements FanRepository {
  /** Всё, что хранится о фане: для экспорта по запросу (право на доступ к данным). */
  async exportData(fanId: string): Promise<FanDossier | null> {
    const fan = await this.get(fanId);
    if (!fan) return null;
    const [memories, events, purchases] = await Promise.all([
      this.memories(fanId),
      this.events(fanId),
      this.purchases(fanId),
    ]);
    const { data: convData, error: convError } = await db()
      .from("conversations")
      .select("id, platform")
      .eq("fan_id", fanId);
    if (convError) throw convError;
    const convRows = (convData ?? []) as { id: string; platform: string }[];
    const messageRows = await inChunks(convRows.map((c) => c.id), (chunk) =>
      db().from("messages").select("*").in("conversation_id", chunk).order("created_at", { ascending: true }),
    );
    const byConversation = new Map<string, Message[]>();
    for (const row of messageRows as MessageRow[]) {
      const list = byConversation.get(row.conversation_id) ?? [];
      list.push(mapMessage(row));
      byConversation.set(row.conversation_id, list);
    }
    return {
      exportedAt: new Date().toISOString(),
      fan,
      memories,
      events,
      purchases,
      conversations: convRows.map((c) => ({
        id: c.id,
        channel: c.platform,
        messages: byConversation.get(c.id) ?? [],
      })),
    };
  }

  /**
   * Удаление фана. Переписки, сообщения, воспоминания, покупки и подписки стираются
   * каскадно (ON DELETE CASCADE). Записи выручки сохраняются без привязки к фану
   * (ON DELETE SET NULL): это учётные данные. События удаляются явно — у них нет FK.
   */
  async erase(fanId: string): Promise<boolean> {
    const { error: eventsError } = await db().from("events").delete().eq("entity_type", "fan").eq("entity_id", fanId);
    if (eventsError) throw eventsError;
    const { data, error } = await db().from("fans").delete().eq("id", fanId).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async list(query?: { search?: string; segment?: string }): Promise<Fan[]> {
    const { data, error } = await db()
      .from("fans")
      .select("*")
      .order("last_interaction_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const fanRows = (data ?? []) as FanRow[];
    const subsMap = await subscriptionsByFan(fanRows.map((f) => f.id));
    let rows = fanRows.map((fan) => mapFan(fan, subsMap.get(fan.id) ?? []));
    if (query?.search) {
      const q = query.search.toLowerCase();
      rows = rows.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.handle.toLowerCase().includes(q) ||
          f.source.toLowerCase().includes(q),
      );
    }
    if (query?.segment && query.segment !== "All") {
      const s = query.segment;
      rows = rows.filter((f) => {
        if (s === "New") return f.status === "New";
        if (s === "Active") return f.status === "Active";
        if (s === "Subscribers") return f.subscription?.status === "Active";
        if (s === "Buyers") return f.purchases > 0;
        if (s === "Inner circle") return f.relationship === "Inner circle";
        if (s === "At Risk") return f.status === "Churn risk" || f.status === "Sleeping";
        return true;
      });
    }
    return rows;
  }

  async get(id: string): Promise<Fan | null> {
    const { data, error } = await db().from("fans").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const subsMap = await subscriptionsByFan([id]);
    return mapFan(data as FanRow, subsMap.get(id) ?? []);
  }

  async memories(fanId: string): Promise<Memory[]> {
    const { data, error } = await db()
      .from("fan_memories")
      .select("*")
      .eq("fan_id", fanId)
      .order("importance", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((m) => ({
      id: m.id,
      fanId: m.fan_id,
      statement: m.memory,
      category: memoryCategory(m.category),
      confidence: Number(m.importance),
      source: m.source_message_id ? "conversation" : "manual",
      createdAt: m.created_at,
    }));
  }

  async events(fanId: string): Promise<FanEvent[]> {
    const { data, error } = await db()
      .from("events")
      .select("*")
      .eq("entity_type", "fan")
      .eq("entity_id", fanId)
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const mapType = (t: string): FanEvent["type"] => {
      if (t.startsWith("purchase")) return "purchase";
      if (t.includes("message") || t.includes("reply")) return "message";
      if (t.startsWith("subscription")) return "subscription";
      if (t.startsWith("tip")) return "tip";
      if (t.startsWith("content")) return "content";
      return "system";
    };
    return (data ?? []).map((e) => ({
      id: e.id,
      fanId,
      type: mapType(e.type),
      title: e.type.replaceAll("_", " "),
      detail: JSON.stringify(e.payload ?? {}),
      at: e.occurred_at,
    }));
  }

  async purchases(fanId: string): Promise<Purchase[]> {
    const { data, error } = await db()
      .from("purchases")
      .select("*")
      .eq("fan_id", fanId)
      .order("purchased_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as PurchaseRow[];
    const offerIds = [...new Set(rows.map((r) => r.offer_id).filter((x): x is string => Boolean(x)))];
    const offersById = new Map<string, { name: string; type: OfferRow["type"] }>();
    if (offerIds.length) {
      const offers = await inChunks(offerIds, (chunk) => db().from("offers").select("id, name, type").in("id", chunk));
      for (const o of offers ?? []) offersById.set(o.id, { name: o.name, type: o.type });
    }
    return rows.map((row) => {
      const offer = row.offer_id ? offersById.get(row.offer_id) : undefined;
      const kindRaw = offer ? OFFER_TO_UI[offer.type] : "PPV";
      const kind = kindRaw === "VIP" ? "Subscription" : kindRaw;
      return {
        id: row.id,
        fanId: row.fan_id,
        offer: offer?.name ?? "One-off purchase",
        kind,
        amount: Number(row.amount),
        at: row.purchased_at,
        status: row.status === "refunded" ? ("Refunded" as const) : ("Paid" as const),
      };
    });
  }

  async addMemory(fanId: string, memory: { statement: string; category: Memory["category"]; confidence: number; source: string }): Promise<Memory> {
    const userId = await requireUserId();
    // Duplicate prevention: if a very similar memory already exists for this fan, return it instead of creating a duplicate.
    // Match via a 25-character prefix bidirectionally (startsWith on either side catches shortened/expanded re-statements).
    const newText = memory.statement.trim().toLowerCase();
    const prefix = newText.slice(0, 25);
    if (prefix) {
      const { data: existing } = await db()
        .from("fan_memories")
        .select("*")
        .eq("fan_id", fanId)
        .ilike("memory", `${prefix}%`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          fanId,
          statement: existing.memory,
          category: memoryCategory(existing.category),
          confidence: Number(existing.importance),
          source: memory.source,
          createdAt: existing.created_at,
        };
      }
    }
    const { data, error } = await db()
      .from("fan_memories")
      .insert({
        user_id: userId,
        fan_id: fanId,
        memory: memory.statement,
        category: memory.category,
        importance: memory.confidence,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      fanId,
      statement: data.memory,
      category: memoryCategory(data.category),
      confidence: Number(data.importance),
      source: memory.source,
      createdAt: data.created_at,
    };
  }

  async setRelationship(id: string, level: Fan["relationship"]): Promise<Fan | null> {
    const { error } = await db()
      .from("fans")
      .update({ relationship_level: REL_TO_DB[level] })
      .eq("id", id);
    if (error) throw error;
    return this.get(id);
  }
}

/* ----------------------------- Conversations ------------------------------ */

function mapMessage(row: MessageRow): Message {
  const isDraft = row.status === "awaiting_approval" || row.status === "draft";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    author: row.sender_type === "fan" ? "fan" : row.ai_generated && isDraft ? "ai_draft" : "mara",
    body: row.content,
    at: row.sent_at ?? row.created_at,
    state: MSG_STATUS_TO_UI[row.status],
  };
}

class SupabaseConversationRepository implements ConversationRepository {
  async list(): Promise<Conversation[]> {
    const { data, error } = await db()
      .from("conversations")
      .select("*")
      .order("pinned", { ascending: false })
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const rows = (data ?? []) as ConversationRow[];

    // Последний AI-черновик на диалог — карточка «AI suggestion» в инбоксе.
    const ids = rows.map((r) => r.id);
    const draftsByConv = new Map<string, string>();
    if (ids.length) {
      const drafts = await inChunks(ids, (chunk) =>
        db()
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", chunk)
          .eq("status", "awaiting_approval")
          .order("created_at", { ascending: false }),
      );
      for (const d of drafts) {
        if (!draftsByConv.has(d.conversation_id)) draftsByConv.set(d.conversation_id, d.content);
      }
    }

    return rows.map((c) => {
      const draft = draftsByConv.get(c.id);
      return {
        id: c.id,
        fanId: c.fan_id,
        channel: fanSourceLabel(c.platform),
        subject: c.subject,
        unread: c.unread_count,
        awaitingApproval: c.awaiting_approval_count,
        pinned: c.pinned,
        lastMessageAt: c.last_message_at ?? c.updated_at,
        aiSuggestion: draft
          ? { body: draft, tone: "on-character", intent: "reply", confidence: 0.9 }
          : undefined,
      };
    });
  }

  async messages(conversationId: string): Promise<Message[]> {
    const { data, error } = await db()
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapMessage);
  }

  async sendMessage(conversationId: string, input: SendMessageInput) {
    const userId = await requireUserId();
    // Ответ оператора записывается как «approved»: доставки фану пока нет, sent_at не ставим.
    const fromMara = input.author === "mara";
    const { data, error } = await db()
      .from("messages")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        sender_type: input.author,
        content: input.body,
        status: fromMara ? "approved" : "sent",
        ai_generated: input.aiGenerated ?? false,
        approved: fromMara,
        sent_at: fromMara ? null : new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    await db()
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    return mapMessage(data);
  }

  async saveDraft(conversationId: string, body: string) {
    const userId = await requireUserId();
    const { data, error } = await db()
      .from("messages")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        sender_type: "mara",
        content: body,
        status: "awaiting_approval",
        ai_generated: true,
        approved: false,
      })
      .select()
      .single();
    if (error) throw error;
    const { data: conv } = await db()
      .from("conversations")
      .select("awaiting_approval_count")
      .eq("id", conversationId)
      .single();
    await db()
      .from("conversations")
      .update({ awaiting_approval_count: (conv?.awaiting_approval_count ?? 0) + 1 })
      .eq("id", conversationId);
    return mapMessage(data);
  }

  async approveDraft(conversationId: string, messageId: string, body?: string) {
    // Одобрение фиксирует решение оператора (status=approved). Доставку фану приложение
    // не выполняет, поэтому sent_at не ставится, а ai_generated остаётся для трассировки.
    const patch: Database["public"]["Tables"]["messages"]["Update"] = {
      status: "approved",
      approved: true,
    };
    if (body !== undefined) patch.content = body;
    const { data, error } = await db()
      .from("messages")
      .update(patch)
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    const { data: conv } = await db()
      .from("conversations")
      .select("awaiting_approval_count")
      .eq("id", conversationId)
      .single();
    await db()
      .from("conversations")
      .update({
        awaiting_approval_count: Math.max(0, (conv?.awaiting_approval_count ?? 1) - 1),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    return mapMessage(data);
  }

  async markRead(conversationId: string) {
    const { error } = await db()
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);
    if (error) throw error;
  }
}

/* --------------------------------- Content ------------------------------- */

class SupabaseContentRepository implements ContentRepository {
  async list(query?: { search?: string; status?: string; platform?: string; type?: string }): Promise<ContentItem[]> {
    let q = db()
      .from("content")
      .select("*")
      .order("created_at", { ascending: false });
    if (query?.status && query.status !== "All") {
      const statusDb = CSTATUS_TO_DB[query.status as ContentItem["status"]];
      if (statusDb) q = q.eq("status", statusDb);
    }
    if (query?.platform && query.platform !== "All") {
      const platformDb = PLATFORM_UI_TO_DB[query.platform as Platform];
      if (platformDb) q = q.eq("platform", platformDb);
    }
    if (query?.type && query.type !== "All") {
      const typeDb = CTYPE_TO_DB[query.type as ContentItem["type"]];
      if (typeDb) q = q.eq("content_type", typeDb);
    }
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? []) as ContentRow[];
    if (query?.search) {
      const s = query.search.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(s) || (r.caption ?? "").toLowerCase().includes(s));
    }
    const perf = await this.performanceByContent(rows.map((r) => r.id));

    return rows.map((c) => {
      const p = perf.get(c.id);
      return {
        id: c.id,
        title: c.title,
        description: c.description ?? "",
        hook: c.hook,
        caption: c.caption,
        script: c.script ?? "",
        cta: c.cta,
        platform: contentPlatformLabel(c.platform),
        type: CTYPE_TO_UI[c.content_type],
        status: CSTATUS_TO_UI[c.status],
        episodeId: c.episode_id ?? undefined,
        assetIds: c.asset_ids,
        scheduledFor: c.scheduled_at ?? undefined,
        publishedAt: c.published_at ?? undefined,
        views: p?.views ?? 0,
        engagement: p?.engagement ?? 0,
        revenue: p?.revenue ?? 0,
        newFollowers: p?.conversions ?? 0,
      };
    });
  }

  private async performanceByContent(ids: string[]) {
    const map = new Map<string, { views: number; engagement: number; revenue: number; conversions: number }>();
    if (!ids.length) return map;
    const data = await inChunks(ids, (chunk) =>
      db()
        .from("content_performance")
        .select("content_id, views, likes, comments, shares, saves, conversions, revenue")
        .in("content_id", chunk),
    );
    for (const p of data) {
      const cur = map.get(p.content_id) ?? { views: 0, engagement: 0, revenue: 0, conversions: 0 };
      cur.views += p.views;
      cur.engagement += p.likes + p.comments + p.shares + p.saves;
      cur.revenue += Number(p.revenue);
      cur.conversions += p.conversions;
      map.set(p.content_id, cur);
    }
    return map;
  }

  async get(id: string): Promise<ContentItem | null> {
    const all = await this.list();
    return all.find((c) => c.id === id) ?? null;
  }

  async episodes(): Promise<Episode[]> {
    const { data, error } = await db().from("episodes").select("*").order("number", { ascending: true });
    if (error) throw error;
    const content = await this.list();
    // Aggregate content performance per episode
    const perfByEp = new Map<string, { views: number; followers: number }>();
    for (const c of content) {
      if (!c.episodeId) continue;
      const cur = perfByEp.get(c.episodeId) ?? { views: 0, followers: 0 };
      cur.views += c.views;
      cur.followers += c.newFollowers;
      perfByEp.set(c.episodeId, cur);
    }
    return ((data ?? []) as EpisodeRow[]).map((e) => {
      const perf = perfByEp.get(e.id) ?? { views: 0, followers: 0 };
      return {
        id: e.id,
        number: e.number,
        title: e.title,
        logline: e.summary ?? "",
        description: e.summary ?? "",
        status: ESTATUS_TO_UI[e.status],
        publishedAt: e.start_date ?? undefined,
        beat: Array.isArray(e.key_events) && e.key_events.length ? String(e.key_events[0]) : "",
        contentIds: content.filter((c) => c.episodeId === e.id).map((c) => c.id),
        assetIds: [],
        performance: { views: perf.views, followers: perf.followers, retention: 0 },
      };
    });
  }

  async assets(): Promise<Asset[]> {
    const { data, error } = await db().from("assets").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const mapKind = (a: AssetRow): Asset["kind"] => {
      if (a.kind === "video") return "Videos";
      if (a.category === "fashion") return "Outfits";
      if (a.category === "travel" || a.category === "car" || a.category === "home") return "Locations";
      if (a.category === "portrait") return "Expressions";
      if (a.category === "story" || a.category === "other") return "References";
      return "Photos";
    };
    return ((data ?? []) as AssetRow[]).map((a) => ({
      id: a.id,
      kind: mapKind(a),
      title: a.title,
      thumb: a.thumbnail_url ?? a.url ?? "",
      prompt: a.prompt,
      model: (a.model === "local" || a.model === "cloud-pro" || a.model === "cloud-turbo" ? a.model : "cloud-pro") as Asset["model"],
      outfit: "",
      location: "",
      lighting: "",
      quality: Math.round((Number((a.metadata as Record<string, unknown>)?.quality) || 92)),
      approval: a.approval === "approved" ? "Approved" : a.approval === "rejected" ? "Rejected" : "Pending",
      usedIn: 0,
      createdAt: a.created_at,
    }));
  }

  async saveDraft(item: Partial<ContentItem> & { title: string }) {
    const userId = await requireUserId();
    const payload: Database["public"]["Tables"]["content"]["Insert"] = {
      user_id: userId,
      title: item.title,
      description: item.description ?? "",
      hook: item.hook ?? "",
      caption: item.caption ?? "",
      script: item.script ?? "",
      cta: item.cta ?? "",
      content_type: CTYPE_TO_DB[item.type ?? "Video"],
      platform: PLATFORM_UI_TO_DB[item.platform ?? "TikTok"],
      status: CSTATUS_TO_DB[item.status ?? "Draft"],
      episode_id: item.episodeId ?? null,
      scheduled_at: item.scheduledFor ?? null,
    };
    const query = item.id
      ? db().from("content").update({ ...payload, id: undefined, user_id: undefined }).eq("id", item.id).select().single()
      : db().from("content").insert(payload).select().single();
    const { data, error } = await query;
    if (error) throw error;
    const saved = data as ContentRow;
    return {
      id: saved.id,
      title: saved.title,
      description: saved.description ?? "",
      hook: saved.hook,
      caption: saved.caption,
      script: saved.script ?? "",
      cta: saved.cta,
      platform: contentPlatformLabel(saved.platform),
      type: CTYPE_TO_UI[saved.content_type],
      status: CSTATUS_TO_UI[saved.status],
      episodeId: saved.episode_id ?? undefined,
      assetIds: saved.asset_ids,
      scheduledFor: saved.scheduled_at ?? undefined,
      publishedAt: saved.published_at ?? undefined,
      views: 0,
      engagement: 0,
      revenue: 0,
      newFollowers: 0,
    };
  }

  async setStatus(id: string, status: ContentItem["status"]) {
    const patch: Database["public"]["Tables"]["content"]["Update"] = { status: CSTATUS_TO_DB[status] };
    if (status === "Published") patch.published_at = new Date().toISOString();
    const { error } = await db().from("content").update(patch).eq("id", id);
    if (error) throw error;
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await db().from("content").delete().eq("id", id).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async createEpisode(episode: Partial<Episode> & { title: string; number: number }): Promise<Episode> {
    const userId = await requireUserId();
    const { data, error } = await db()
      .from("episodes")
      .insert({
        user_id: userId,
        number: episode.number,
        title: episode.title,
        summary: episode.description ?? episode.logline ?? "",
        status: "outline",
        start_date: episode.publishedAt ?? null,
        key_events: episode.beat ? [episode.beat] : [],
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as EpisodeRow;
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      logline: row.summary ?? "",
      description: row.summary ?? "",
      status: ESTATUS_TO_UI[row.status],
      publishedAt: row.start_date ?? undefined,
      beat: Array.isArray(row.key_events) && row.key_events.length ? String(row.key_events[0]) : "",
      contentIds: [],
      assetIds: [],
      performance: { views: 0, followers: 0, retention: 0 },
    };
  }

  async updateEpisode(id: string, patch: Partial<Episode>): Promise<Episode | null> {
    const payload: Database["public"]["Tables"]["episodes"]["Update"] = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.description !== undefined) payload.summary = patch.description;
    if (patch.logline !== undefined) payload.summary = patch.logline;
    if (patch.number !== undefined) payload.number = patch.number;
    if (patch.status !== undefined) {
      const map: Record<Episode["status"], EpisodeRow["status"]> = {
        Outline: "outline",
        "In production": "in_production",
        Scheduled: "scheduled",
        Published: "published",
      };
      payload.status = map[patch.status];
    }
    if (patch.publishedAt !== undefined) payload.start_date = patch.publishedAt;
    if (patch.beat !== undefined) payload.key_events = [patch.beat];
    const { error } = await db().from("episodes").update(payload).eq("id", id);
    if (error) throw error;
    const all = await this.episodes();
    return all.find((e) => e.id === id) ?? null;
  }

  async deleteEpisode(id: string): Promise<boolean> {
    // Detach content first (set episode_id null)
    await db().from("content").update({ episode_id: null }).eq("episode_id", id);
    const { data, error } = await db().from("episodes").delete().eq("id", id).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }
}

/* -------------------------------- Commerce ------------------------------- */

class SupabaseCommerceRepository implements CommerceRepository {
  private async offerAggregates() {
    const { data: events } = await db().from("revenue_events").select("offer_id, fan_id, amount");
    const revenue = new Map<string, number>();
    const buyers = new Map<string, Set<string>>();
    for (const e of events ?? []) {
      if (!e.offer_id) continue;
      revenue.set(e.offer_id, (revenue.get(e.offer_id) ?? 0) + Number(e.amount));
      if (e.fan_id) {
        const set = buyers.get(e.offer_id) ?? new Set<string>();
        set.add(e.fan_id);
        buyers.set(e.offer_id, set);
      }
    }
    return { revenue, buyers };
  }

  async offers(): Promise<Offer[]> {
    const { data, error } = await db().from("offers").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    const { revenue, buyers } = await this.offerAggregates();
    const { count: fanCount } = await db().from("fans").select("id", { count: "exact", head: true });
    return ((data ?? []) as OfferRow[]).map((o) => {
      const kind = OFFER_TO_UI[o.type];
      const buyersCount = buyers.get(o.id)?.size ?? 0;
      return {
        id: o.id,
        name: o.name,
        kind,
        price: Number(o.price),
        cadence: o.type === "subscription" || o.type === "vip" || o.type === "telegram_vip" ? ("/ month" as const) : ("one-time" as const),
        buyers: buyersCount,
        revenue: revenue.get(o.id) ?? 0,
        status: OFFER_STATUS_TO_UI[o.status],
        description: o.description,
        conversion: fanCount ? Math.round((buyersCount / fanCount) * 1000) / 10 : 0,
      };
    });
  }

  async revenueBySource(): Promise<SeriesPoint[]> {
    const { data, error } = await db().from("revenue_events").select("platform, amount");
    if (error) throw error;
    const byPlatform = new Map<string, number>();
    for (const e of data ?? []) {
      const label = e.platform ? contentPlatformLabel(e.platform) : "Telegram";
      byPlatform.set(label, (byPlatform.get(label) ?? 0) + Number(e.amount));
    }
    return [...byPlatform.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  }

  async revenueByOffer(): Promise<SeriesPoint[]> {
    const { data, error } = await db().from("revenue_events").select("offer_id, amount");
    if (error) throw error;
    const rows = (data ?? []) as Pick<RevenueRow, "offer_id" | "amount">[];
    const offerIds = [...new Set(rows.map((r) => r.offer_id).filter((x): x is string => Boolean(x)))];
    const names = new Map<string, string>();
    if (offerIds.length) {
      const offers = await inChunks(offerIds, (chunk) => db().from("offers").select("id, name").in("id", chunk));
      for (const o of offers ?? []) names.set(o.id, o.name);
    }
    const byOffer = new Map<string, number>();
    for (const row of rows) {
      const label = (row.offer_id ? names.get(row.offer_id) : undefined) ?? "Other";
      byOffer.set(label, (byOffer.get(label) ?? 0) + Number(row.amount));
    }
    return [...byOffer.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  }

  async topSpenders() {
    const { data, error } = await db()
      .from("purchases")
      .select("fan_id, amount, purchased_at")
      .eq("status", "paid");
    if (error) throw error;
    const rows = (data ?? []) as Pick<PurchaseRow, "fan_id" | "amount" | "purchased_at">[];
    const fanIds = [...new Set(rows.map((r) => r.fan_id))];
    const fanNames = new Map<string, { display_name: string; username: string }>();
    if (fanIds.length) {
      const fans = await inChunks(fanIds, (chunk) => db().from("fans").select("id, display_name, username").in("id", chunk));
      for (const f of fans ?? []) fanNames.set(f.id, f);
    }
    const map = new Map<string, { name: string; handle: string; amount: number; orders: number; last: string }>();
    for (const row of rows) {
      const fan = fanNames.get(row.fan_id);
      const cur = map.get(row.fan_id) ?? {
        name: fan?.display_name ?? "Fan",
        handle: fan?.username ?? "",
        amount: 0,
        orders: 0,
        last: row.purchased_at,
      };
      cur.amount += Number(row.amount);
      cur.orders += 1;
      if (row.purchased_at > cur.last) cur.last = row.purchased_at;
      map.set(row.fan_id, cur);
    }
    return [...map.entries()]
      .map(([fanId, v]) => ({ fanId, ...v, amount: Math.round(v.amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }
}

/* -------------------------------- Analytics ------------------------------ */

const DAY = 86_400_000;

function periodWindow(period: string): { from: Date; buckets: number; bucketMs: number; label: (d: Date) => string } {
  const now = Date.now();
  const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (period === "7 days") return { from: new Date(now - 7 * DAY), buckets: 7, bucketMs: DAY, label: day };
  if (period === "90 days") return { from: new Date(now - 90 * DAY), buckets: 13, bucketMs: 7 * DAY, label: dayNum };
  if (period === "All time") return { from: new Date(now - 365 * DAY), buckets: 12, bucketMs: 30 * DAY, label: month };
  return { from: new Date(now - 30 * DAY), buckets: 30, bucketMs: DAY, label: dayNum };
}

function bucketize<T>(rows: T[], at: (row: T) => string, win: ReturnType<typeof periodWindow>, value: (row: T) => number): SeriesPoint[] {
  const start = win.from.getTime();
  const sums = new Array<number>(win.buckets).fill(0);
  for (const row of rows) {
    const t = new Date(at(row)).getTime();
    if (t < start) continue;
    const idx = Math.min(win.buckets - 1, Math.floor((t - start) / win.bucketMs));
    sums[idx] += value(row);
  }
  return sums.map((v, i) => ({
    label: win.label(new Date(start + i * win.bucketMs)),
    value: Math.round(v * 100) / 100,
  }));
}

class SupabaseAnalyticsRepository implements AnalyticsRepository {
  async metrics(period: string): Promise<MetricSnapshot[]> {
    const win = periodWindow(period);
    const prevFrom = new Date(win.from.getTime() - (Date.now() - win.from.getTime()));

    const { data: revenue } = await db().from("revenue_events").select("amount, category, occurred_at");
    const { count: activeSubs } = await db()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const { data: fans } = await db().from("fans").select("id, created_at, status, total_purchases");
    const { data: cancelled } = await db()
      .from("subscriptions")
      .select("id, cancelled_at")
      .eq("status", "cancelled");

    const rev = revenue ?? [];
    const inWin = (iso: string, from: Date) => new Date(iso).getTime() >= from.getTime();
    const sum = (rows: RevenueRow[] | { amount: number }[], from: Date) =>
      rows.filter((r) => inWin((r as RevenueRow).occurred_at, from)).reduce((s, r) => s + Number(r.amount), 0);

    const cur = sum(rev, win.from);
    const sincePrev = sum(rev, prevFrom);
    const prev = Math.max(0, sincePrev - cur);
    const ppvCur = rev.filter((r) => r.category === "ppv" && inWin(r.occurred_at, win.from)).reduce((s, r) => s + Number(r.amount), 0);
    const newFans = (fans ?? []).filter((f) => inWin(f.created_at, win.from)).length;
    const buyers = (fans ?? []).filter((f) => f.total_purchases > 0).length;
    const ltv = buyers ? Math.round((cur / Math.max(1, buyers))) : 0;
    const churned = (cancelled ?? []).filter((s) => s.cancelled_at && inWin(s.cancelled_at, win.from)).length;
    const churnRate = (activeSubs ?? 0) + churned ? Math.round((churned / ((activeSubs ?? 0) + churned)) * 1000) / 10 : 0;
    const delta = cur && prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0;

    const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return [
      { key: "revenue", label: "Revenue", value: money(cur), raw: cur, delta, hint: "vs previous period", accent: true },
      { key: "subs", label: "Subscribers", value: String(activeSubs ?? 0), raw: activeSubs ?? 0, delta: 0, hint: "active subscriptions" },
      { key: "fans", label: "New Fans", value: String(newFans), raw: newFans, delta: 0, hint: "first contact created" },
      { key: "ppv", label: "PPV Sales", value: money(ppvCur), raw: ppvCur, delta: 0, hint: "one-time unlocks" },
      { key: "ltv", label: "Average LTV", value: money(ltv), raw: ltv, delta: 0, hint: "per buyer, period" },
      { key: "churn", label: "Churn", value: `${churnRate}%`, raw: churnRate, delta: 0, hint: "subscription churn" },
    ];
  }

  async revenue(period: string): Promise<SeriesPoint[]> {
    const win = periodWindow(period);
    const { data, error } = await db()
      .from("revenue_events")
      .select("amount, occurred_at")
      .gte("occurred_at", win.from.toISOString());
    if (error) throw error;
    return bucketize((data ?? []) as RevenueRow[], (r) => r.occurred_at, win, (r) => Number(r.amount));
  }

  async audience(period: string): Promise<SeriesPoint[]> {
    const win = periodWindow(period);
    const { data, error } = await db()
      .from("fans")
      .select("created_at")
      .gte("created_at", win.from.toISOString());
    if (error) throw error;
    return bucketize(data ?? [], (r) => r.created_at, win, () => 1);
  }

  async engagement(period: string): Promise<SeriesPoint[]> {
    const win = periodWindow(period);
    const { data, error } = await db()
      .from("content_performance")
      .select("likes, comments, shares, saves, measured_at")
      .gte("measured_at", win.from.toISOString());
    if (error) throw error;
    return bucketize(data ?? [], (r) => r.measured_at, win, (r) => r.likes + r.comments + r.shares + r.saves);
  }

  async funnel(): Promise<SeriesPoint[]> {
    const { data: fans } = await db().from("fans").select("relationship_level, total_purchases");
    const { count: subs } = await db()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const rows = fans ?? [];
    const order = ["visitor", "follower", "regular", "fan", "favorite", "inner_circle"];
    const atLeast = (min: number) => rows.filter((f) => order.indexOf(f.relationship_level) >= min).length;
    return [
      { label: "Visitors", value: rows.length },
      { label: "Followers", value: atLeast(1) },
      { label: "Fans", value: atLeast(3) },
      { label: "Subscribers", value: subs ?? 0 },
      { label: "Buyers", value: rows.filter((f) => f.total_purchases > 0).length },
      { label: "Inner circle", value: atLeast(5) },
    ];
  }

  async retention(): Promise<SeriesPoint[]> {
    const { data } = await db().from("subscriptions").select("started_at, cancelled_at, status");
    const now = Date.now();
    const points: SeriesPoint[] = [];
    for (let m = 5; m >= 0; m--) {
      const cohortEnd = new Date(now - m * 30 * DAY);
      const cohort = (data ?? []).filter((s) => new Date(s.started_at).getTime() <= cohortEnd.getTime());
      const alive = cohort.filter(
        (s) => s.status === "active" || (s.cancelled_at && new Date(s.cancelled_at).getTime() > cohortEnd.getTime()),
      ).length;
      points.push({
        label: cohortEnd.toLocaleDateString("en-US", { month: "short" }),
        value: cohort.length ? Math.round((alive / cohort.length) * 100) : 100,
      });
    }
    return points;
  }

  async topContent() {
    const { data: perf } = await db()
      .from("content_performance")
      .select("content_id, platform, views, conversions")
      .order("views", { ascending: false })
      .limit(50);
    const best = new Map<string, { platform: string; views: number; followers: number }>();
    for (const p of perf ?? []) {
      const cur = best.get(p.content_id) ?? { platform: p.platform, views: 0, followers: 0 };
      cur.views += p.views;
      cur.followers += p.conversions;
      best.set(p.content_id, cur);
    }
    const ids = [...best.keys()].slice(0, 5);
    if (!ids.length) return [];
    const content = await inChunks(ids, (chunk) => db().from("content").select("id, title").in("id", chunk));
    const title = new Map((content ?? []).map((c) => [c.id, c.title]));
    return ids.map((id, i) => ({
      rank: i + 1,
      title: title.get(id) ?? "Untitled",
      views: best.get(id)!.views,
      followers: best.get(id)!.followers,
      platform: contentPlatformLabel(best.get(id)!.platform),
      id,
    }));
  }

  async revenueSummary() {
    const { data: events } = await db().from("revenue_events").select("amount, category, platform, occurred_at");
    const { count: purchasesCount } = await db()
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid");
    const { count: subsCount } = await db()
      .from("subscriptions")
      .select("id", { count: "exact", head: true });
    const rows = (events ?? []) as RevenueRow[];
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now - 7 * DAY);
    const monthAgo = new Date(now - 30 * DAY);
    const sum = (from?: Date, to?: Date) =>
      rows
        .filter((r) => {
          const t = new Date(r.occurred_at).getTime();
          if (from && t < from.getTime()) return false;
          if (to && t > to.getTime()) return false;
          return true;
        })
        .reduce((s, r) => s + Number(r.amount), 0);
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const purchases = purchasesCount ?? 0;
    const byCategory: Record<string, number> = {};
    const srcMap = new Map<string, number>();
    for (const r of rows) {
      const cat = r.category;
      byCategory[cat] = (byCategory[cat] ?? 0) + Number(r.amount);
      const label = r.platform ? contentPlatformLabel(r.platform) : "Other";
      srcMap.set(label, (srcMap.get(label) ?? 0) + Number(r.amount));
    }
    return {
      today: Math.round(sum(startOfDay) * 100) / 100,
      thisWeek: Math.round(sum(weekAgo) * 100) / 100,
      thisMonth: Math.round(sum(monthAgo) * 100) / 100,
      total: Math.round(total * 100) / 100,
      purchases,
      subscriptions: subsCount ?? 0,
      averageOrderValue: purchases > 0 ? Math.round((total / purchases) * 100) / 100 : 0,
      byCategory,
      bySource: [...srcMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })),
    };
  }

  async followersByPlatform(): Promise<SeriesPoint[]> {
    // We do not have real follower counts from external platforms yet.
    // Return data from our own CRM: count fans by source (fan acquisition platform).
    const { data } = await db().from("fans").select("source");
    const map = new Map<string, number>();
    for (const f of data ?? []) {
      const label = contentPlatformLabel(f.source);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    // Add platforms with zero fans so the UI shows them honestly.
    for (const p of ["TikTok", "Instagram", "Telegram", "Threads", "Fanvue"] as const) {
      if (!map.has(p)) map.set(p, 0);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }
}

/* ----------------------------------- AI ---------------------------------- */

const AGENT_CATALOG: Omit<Agent, "status" | "lastRun" | "tasks" | "successRate">[] = [
  {
    id: "character",
    name: "Character Agent",
    role: "Voice & lore guardian",
    description:
      "Owns Mara's voice, boundaries and storyline continuity. Reviews every outbound message and caption against the character card.",
    capabilities: ["voice check", "lore consistency", "boundary enforcement"],
  },
  {
    id: "conversation",
    name: "Conversation Agent",
    role: "Reply drafting",
    description: "Drafts replies in Mara's voice from conversation context, fan memories and relationship level.",
    capabilities: ["reply drafts", "intent detection", "escalation hints"],
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Long-term fan facts",
    description: "Decides which facts from conversations deserve long-term storage in fan_memories.",
    capabilities: ["memory extraction", "dedup", "importance scoring"],
  },
  {
    id: "sales",
    name: "Sales Agent",
    role: "Monetization timing",
    description: "Recommends sell / wait / nurture and suggests the right offer at the right moment.",
    capabilities: ["offer matching", "timing", "churn win-back"],
  },
  {
    id: "content",
    name: "Content Agent",
    role: "Hooks, captions, scripts",
    description: "Generates hooks, captions, episode ideas and A/B variants inside the current story arc.",
    capabilities: ["hooks", "captions", "episode arcs", "PPV ideas"],
  },
  {
    id: "analytics",
    name: "Analytics Agent",
    role: "Numbers → decisions",
    description: "Turns content performance, funnel and revenue into specific, actionable recommendations.",
    capabilities: ["funnel analysis", "revenue insights", "churn watch"],
  },
];

class SupabaseAIRepository implements AIRepository {
  async agents(): Promise<Agent[]> {
    const { data } = await db().from("ai_runs").select("agent, created_at").order("created_at", { ascending: false }).limit(200);
    const lastByAgent = new Map<string, string>();
    const countByAgent = new Map<string, number>();
    for (const r of data ?? []) {
      if (!lastByAgent.has(r.agent)) lastByAgent.set(r.agent, r.created_at);
      countByAgent.set(r.agent, (countByAgent.get(r.agent) ?? 0) + 1);
    }
    return AGENT_CATALOG.map((a) => {
      const last = lastByAgent.get(a.id);
      const age = last ? Date.now() - new Date(last).getTime() : Number.POSITIVE_INFINITY;
      return {
        ...a,
        status: age < 3_600_000 ? ("Online" as const) : ("Idle" as const),
        lastRun: last ? new Date(last).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never",
        tasks: countByAgent.get(a.id) ?? 0,
        successRate: 0,
      };
    });
  }

  async insights(): Promise<AIInsight[]> {
    const { data, error } = await db().from("ai_insights").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return ((data ?? []) as InsightRow[]).map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      body: i.body,
      recommendation: i.recommendation,
      confidence: Number(i.confidence ?? 0.8),
      cta: { label: "Open AI Studio", to: "/ai" },
    }));
  }

  async automations(): Promise<Automation[]> {
    const { data, error } = await db().from("automations").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    const { data: runs } = await db().from("automation_runs").select("automation_id").order("created_at", { ascending: false });
    const runCount = new Map<string, number>();
    for (const r of runs ?? []) runCount.set(r.automation_id, (runCount.get(r.automation_id) ?? 0) + 1);
    return ((data ?? []) as AutomationRow[]).map((a) => ({
      id: a.id,
      name: a.name,
      trigger: `${capitalize(a.trigger_type)}${a.enabled ? "" : " · disabled"}`,
      steps: [
        { id: "s1", label: "Trigger", detail: JSON.stringify(a.trigger_config), actor: "system" as const },
        { id: "s2", label: a.action_type || "Action", detail: JSON.stringify(a.action_config), actor: "ai" as const },
      ],
      runs: runCount.get(a.id) ?? 0,
      status: AUTOMATION_STATUS_TO_UI[a.status],
      lastRun: a.last_run_at
        ? new Date(a.last_run_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "never",
    }));
  }

  async tasks(): Promise<Task[]> {
    const { data, error } = await db()
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as TaskRow[]).map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      status: TSTATUS_TO_UI[t.status],
      priority: TPRIORITY_TO_UI[t.priority],
      group: t.due_date && new Date(t.due_date).getTime() - Date.now() < DAY ? "Today" : "This week",
      due: t.due_date ? shortDate(t.due_date) : "—",
      source: t.source ? capitalize(t.source.replaceAll("_", " ")) : "Manual",
    }));
  }

  async runs(limit = 50): Promise<AiRunEntry[]> {
    const { data, error } = await db()
      .from("ai_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      agent: r.agent,
      input: r.input,
      output: r.output,
      status: r.status === "error" ? "error" : "success",
      model: r.model,
      durationMs: r.duration_ms ?? 0,
      createdAt: r.created_at,
    }));
  }

  async logRun(entry: Omit<AiRunEntry, "id" | "createdAt">) {
    const userId = await requireUserId();
    const { error } = await db().from("ai_runs").insert({
      user_id: userId,
      agent: entry.agent,
      input: entry.input as Database["public"]["Tables"]["ai_runs"]["Insert"]["input"],
      output: entry.output as Database["public"]["Tables"]["ai_runs"]["Insert"]["output"],
      status: entry.status,
      model: entry.model,
      duration_ms: entry.durationMs,
    });
    if (error) throw error;
  }

  async setAutomationStatus(id: string, status: Automation["status"]) {
    const { error } = await db()
      .from("automations")
      .update({ status: AUTOMATION_STATUS_TO_DB[status], enabled: status === "Active" })
      .eq("id", id);
    if (error) throw error;
    const all = await this.automations();
    return all.find((a) => a.id === id) ?? null;
  }

  async recordAutomationRun(id: string) {
    const userId = await requireUserId();
    const nowIso = new Date().toISOString();
    await db().from("automation_runs").insert({ user_id: userId, automation_id: id, status: "success", finished_at: nowIso });
    await db().from("automations").update({ last_run_at: nowIso }).eq("id", id);
    const all = await this.automations();
    return all.find((a) => a.id === id) ?? null;
  }

  async setTaskStatus(id: string, status: Task["status"]) {
    const { error } = await db().from("tasks").update({ status: TSTATUS_TO_DB[status] }).eq("id", id);
    if (error) throw error;
    const all = await this.tasks();
    return all.find((t) => t.id === id) ?? null;
  }

  async addTask(task: Pick<Task, "title" | "detail" | "priority" | "group" | "due"> & { source?: string }): Promise<Task> {
    const userId = await requireUserId();
    const { data, error } = await db()
      .from("tasks")
      .insert({
        user_id: userId,
        title: task.title,
        detail: task.detail,
        type: "admin",
        priority: TPRIORITY_TO_DB[task.priority],
        status: "todo",
        source: task.source ?? "manual",
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      title: data.title,
      detail: data.detail,
      status: "Todo",
      priority: TPRIORITY_TO_UI[data.priority],
      group: task.group,
      due: task.due,
      source: task.source ?? "Manual",
    };
  }
}

/* ------------------------------- Character ------------------------------- */

class SupabaseCharacterRepository implements CharacterRepository {
  async get(): Promise<Character> {
    const { data, error } = await db()
      .from("characters")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Персонаж ещё не создан — отдаём публичную карточку Mara как дефолт.
      const { character: staticCharacter } = await import("@/data/ops-compat");
      return staticCharacter;
    }
    const c = data as Row<"characters">;
    const { data: traitsRow } = await db()
      .from("character_traits")
      .select("*")
      .eq("character_id", c.id)
      .maybeSingle();
    const traits = (traitsRow ?? null) as Row<"character_traits"> | null;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
    return {
      id: c.id,
      name: c.name,
      age: Number.parseInt(c.age_display, 10) || 23,
      city: c.location,
      occupation: c.occupation,
      story: c.description,
      logline: traits?.lore || c.description,
      voice: traits ? [traits.tone, traits.speech_style].filter(Boolean).join(" ") : "",
      boundaries: list(traits?.boundaries),
      traits: [
        { label: "Tone", value: traits?.tone ?? "" },
        { label: "Style", value: traits?.speech_style ?? "" },
        { label: "Signature object", value: list(traits?.recurring_objects).join(", ") },
        { label: "Personality", value: list(traits?.personality).join(", ") },
      ].filter((t) => t.value),
    };
  }

  async update(patch: Partial<Character>): Promise<Character> {
    const current = await this.get();
    if (patch.name || patch.city || patch.occupation || patch.story) {
      const { error } = await db()
        .from("characters")
        .update({
          name: patch.name ?? current.name,
          location: patch.city ?? current.city,
          occupation: patch.occupation ?? current.occupation,
          description: patch.story ?? current.story,
        })
        .eq("id", current.id);
      if (error) throw error;
    }
    return this.get();
  }
}

export const supabaseRepositories: Repositories = {
  fans: new SupabaseFanRepository(),
  conversations: new SupabaseConversationRepository(),
  content: new SupabaseContentRepository(),
  commerce: new SupabaseCommerceRepository(),
  analytics: new SupabaseAnalyticsRepository(),
  ai: new SupabaseAIRepository(),
  character: new SupabaseCharacterRepository(),
};
