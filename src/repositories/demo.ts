import type {
  Agent,
  AIInsight,
  Automation,
  Character,
  ContentItem,
  Conversation,
  Episode,
  Fan,
  FanEvent,
  Memory,
  Message,
  Offer,
  Task,
} from "@/types";
// Типы интерфейсов — из ./types; параметры методов указаны явно,
// потому что `implements` не получает контекстную типизацию.
import * as fansData from "@/data/fans";
import * as contentData from "@/data/content";
import * as ops from "@/data/ops";
import { demoId, demoStore, mutateDemoStore } from "./demo-store";
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
 * Демо-реализации репозиториев Mara OS.
 *
 * Работают без Supabase: читают вымышленный датасет `src/data/*` и
 * дополняют его локальными правками из demo-store. Каждый метод async —
 * интерфейс ведёт себя как сетевой, поэтому переход на облачные
 * репозитории не требует изменений в компонентах.
 */

const LATENCY = 200;
const wait = <T,>(value: T, ms = LATENCY): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const now = () => new Date().toISOString();

/* ---------------------------------- Fans --------------------------------- */

class DemoFanRepository implements FanRepository {
  list(query?: { search?: string; segment?: string }) {
    const rel = demoStore().fansRelationship;
    let rows = fansData.fans.map((f) => (rel[f.id] ? { ...f, relationship: rel[f.id] } : f));
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
    return wait(rows);
  }

  async get(id: string) {
    const all = await this.list();
    return wait(all.find((f) => f.id === id) ?? null, 60);
  }

  memories(fanId: string) {
    const extra = demoStore().memories[fanId] ?? [];
    return wait([...fansData.memories.filter((m) => m.fanId === fanId), ...extra].map((m) => ({ ...m })));
  }

  events(fanId: string) {
    const tracked = demoStore().events.filter((e) => e.fanId === fanId);
    const mapped: FanEvent[] = tracked.map((e) => ({
      id: e.id,
      fanId: fanId,
      type: (e.type.startsWith("purchase") ? "purchase"
        : e.type.startsWith("subscription") ? "subscription"
        : e.type.includes("message") || e.type.includes("reply") ? "message"
        : e.type.startsWith("content") ? "content"
        : "system") as FanEvent["type"],
      title: e.title,
      detail: e.detail,
      at: e.at,
      amount: e.amount,
    }));
    return wait([...mapped, ...fansData.events.filter((e) => e.fanId === fanId)]);
  }

  purchases(fanId: string) {
    return wait(fansData.purchases.filter((p) => p.fanId === fanId));
  }

  addMemory(fanId: string, memory: { statement: string; category: Memory["category"]; confidence: number; source: string }) {
    const entry: Memory = {
      id: demoId("mem"),
      fanId,
      statement: memory.statement,
      category: memory.category,
      confidence: memory.confidence,
      source: memory.source,
      createdAt: now(),
    };
    mutateDemoStore((s) => {
      s.memories[fanId] = [...(s.memories[fanId] ?? []), entry];
    });
    return wait(structuredClone(entry), 120);
  }

  setRelationship(id: string, level: Fan["relationship"]) {
    mutateDemoStore((s) => {
      s.fansRelationship[id] = level;
    });
    const base = fansData.fans.find((f) => f.id === id);
    return wait(base ? { ...base, relationship: level } : null, 120);
  }
}

/* ----------------------------- Conversations ------------------------------ */

class DemoConversationRepository implements ConversationRepository {
  list(): Promise<Conversation[]> {
    const state = demoStore();
    const rows = fansData.conversations.map((c) => {
      const extra = state.messages[c.id] ?? [];
      const hasDraft = extra.some((m) => m.state === "awaiting_approval" || m.state === "draft");
      const last = extra[extra.length - 1];
      return {
        ...c,
        unread: state.readConversations.includes(c.id) ? 0 : c.unread,
        awaitingApproval: c.awaitingApproval + extra.filter((m) => m.state === "awaiting_approval").length,
        lastMessageAt: last?.at ?? c.lastMessageAt,
        aiSuggestion: hasDraft ? undefined : c.aiSuggestion,
      };
    });
    return wait(rows);
  }

  messages(conversationId: string): Promise<Message[]> {
    const extra = demoStore().messages[conversationId] ?? [];
    return wait([...fansData.messages.filter((m) => m.conversationId === conversationId), ...extra]);
  }

  sendMessage(conversationId: string, input: SendMessageInput) {
    const message: Message = {
      id: demoId("msg"),
      conversationId,
      author: input.author,
      body: input.body,
      at: now(),
      state: "sent",
    };
    mutateDemoStore((s) => {
      s.messages[conversationId] = [...(s.messages[conversationId] ?? []), message];
    });
    return wait(structuredClone(message), 150);
  }

  saveDraft(conversationId: string, body: string, meta?: { tone?: string; intent?: string; confidence?: number }) {
    void meta;
    const message: Message = {
      id: demoId("msg"),
      conversationId,
      author: "ai_draft",
      body,
      at: now(),
      state: "awaiting_approval",
    };
    mutateDemoStore((s) => {
      s.messages[conversationId] = [...(s.messages[conversationId] ?? []), message];
    });
    return wait(structuredClone(message), 150);
  }

  approveDraft(conversationId: string, messageId: string, body?: string) {
    let approved: Message | null = null;
    mutateDemoStore((s) => {
      const list = s.messages[conversationId] ?? [];
      s.messages[conversationId] = list.map((m) => {
        if (m.id !== messageId) return m;
        approved = { ...m, author: "mara" as const, body: body ?? m.body, state: "sent" as const, at: now() };
        return approved;
      });
    });
    if (!approved) {
      return wait({
        id: messageId,
        conversationId,
        author: "mara",
        body: body ?? "",
        at: now(),
        state: "sent",
      } as Message, 120);
    }
    return wait(structuredClone(approved), 120);
  }

  markRead(conversationId: string) {
    mutateDemoStore((s) => {
      if (!s.readConversations.includes(conversationId)) s.readConversations.push(conversationId);
    });
    return wait(undefined, 80);
  }
}

/* --------------------------------- Content ------------------------------- */

class DemoContentRepository implements ContentRepository {
  async list(): Promise<ContentItem[]> {
    const state = demoStore();
    const overridden = contentData.contentItems.map((c) =>
      state.contentStatus[c.id] ? { ...c, status: state.contentStatus[c.id] } : c,
    );
    const drafts = state.contentDrafts.map((c) =>
      state.contentStatus[c.id] ? { ...c, status: state.contentStatus[c.id] } : c,
    );
    return wait([...drafts, ...overridden]);
  }

  async get(id: string) {
    const all = await this.list();
    return wait(all.find((c) => c.id === id) ?? null, 60);
  }

  episodes(): Promise<Episode[]> {
    return wait(contentData.episodes);
  }

  assets() {
    return wait(contentData.assets);
  }

  saveDraft(item: Partial<ContentItem> & { title: string }) {
    const entry: ContentItem = {
      id: item.id ?? demoId("cnt"),
      title: item.title,
      hook: item.hook ?? "",
      caption: item.caption ?? "",
      cta: item.cta ?? "",
      platform: item.platform ?? "TikTok",
      type: item.type ?? "Video",
      status: item.status ?? "Draft",
      episodeId: item.episodeId,
      assetIds: item.assetIds ?? [],
      scheduledFor: item.scheduledFor,
      publishedAt: item.publishedAt,
      views: item.views ?? 0,
      engagement: item.engagement ?? 0,
      revenue: item.revenue ?? 0,
      newFollowers: item.newFollowers ?? 0,
    };
    mutateDemoStore((s) => {
      const idx = s.contentDrafts.findIndex((c) => c.id === entry.id);
      if (idx >= 0) s.contentDrafts[idx] = entry;
      else s.contentDrafts.unshift(entry);
    });
    return wait(structuredClone(entry), 140);
  }

  setStatus(id: string, status: ContentItem["status"]) {
    mutateDemoStore((s) => {
      s.contentStatus[id] = status;
    });
    const base = contentData.contentItems.find((c) => c.id === id);
    const draft = demoStore().contentDrafts.find((c) => c.id === id);
    const found = draft ?? base;
    return wait(found ? { ...found, status } : null, 120);
  }
}

/* -------------------------------- Commerce ------------------------------- */

class DemoCommerceRepository implements CommerceRepository {
  offers(): Promise<Offer[]> {
    return wait(contentData.offers);
  }
  revenueBySource() {
    return wait(ops.revenueBySource);
  }
  revenueByOffer() {
    return wait(ops.revenueByOffer);
  }
  topSpenders() {
    return wait(ops.topSpenders);
  }
}

/* -------------------------------- Analytics ------------------------------ */

class DemoAnalyticsRepository implements AnalyticsRepository {
  metrics(period: string) {
    return wait(ops.metrics(period));
  }
  revenue(period: string) {
    return wait(ops.revenue(period));
  }
  audience(period: string) {
    return wait(ops.audience(period));
  }
  engagement(period: string) {
    return wait(ops.engagement(period));
  }
  funnel() {
    return wait(ops.funnel);
  }
  retention() {
    return wait(ops.retention);
  }
  topContent() {
    return wait(ops.topContent);
  }
}

/* ----------------------------------- AI ---------------------------------- */

class DemoAIRepository implements AIRepository {
  agents(): Promise<Agent[]> {
    return wait(ops.agents);
  }
  insights(): Promise<AIInsight[]> {
    return wait(ops.insights);
  }
  automations(): Promise<Automation[]> {
    const state = demoStore().automationState;
    return wait(
      ops.automations.map((a) =>
        state[a.id] ? { ...a, status: state[a.id].status, lastRun: state[a.id].lastRun, runs: state[a.id].runs } : a,
      ),
    );
  }
  tasks(): Promise<Task[]> {
    const state = demoStore();
    const rows = ops.tasks.map((t) => (state.taskStatus[t.id] ? { ...t, status: state.taskStatus[t.id] } : t));
    return wait([...state.addedTasks, ...rows]);
  }

  runs(limit = 50) {
    return wait(demoStore().aiRuns.slice(0, limit));
  }

  logRun(entry: Omit<AiRunEntry, "id" | "createdAt">) {
    const full: AiRunEntry = { ...entry, id: demoId("run"), createdAt: now() };
    mutateDemoStore((s) => {
      s.aiRuns.unshift(full);
      if (s.aiRuns.length > 200) s.aiRuns.length = 200;
    });
    return wait(undefined, 60);
  }

  setAutomationStatus(id: string, status: Automation["status"]) {
    let updated: Automation | null = null;
    mutateDemoStore((s) => {
      const base = ops.automations.find((a) => a.id === id);
      const prev = s.automationState[id] ?? {
        status: base?.status ?? ("Paused" as const),
        lastRun: base?.lastRun ?? "",
        runs: base?.runs ?? 0,
      };
      s.automationState[id] = { ...prev, status };
      updated = base ? { ...base, ...s.automationState[id] } : null;
    });
    return wait(updated, 120);
  }

  recordAutomationRun(id: string) {
    let updated: Automation | null = null;
    mutateDemoStore((s) => {
      const base = ops.automations.find((a) => a.id === id);
      const prev = s.automationState[id] ?? {
        status: base?.status ?? ("Paused" as const),
        lastRun: base?.lastRun ?? "",
        runs: base?.runs ?? 0,
      };
      s.automationState[id] = { ...prev, lastRun: "<1 min ago", runs: prev.runs + 1 };
      updated = base ? { ...base, ...s.automationState[id] } : null;
    });
    return wait(updated, 150);
  }

  setTaskStatus(id: string, status: Task["status"]) {
    mutateDemoStore((s) => {
      s.taskStatus[id] = status;
    });
    const base = ops.tasks.find((t) => t.id === id) ?? demoStore().addedTasks.find((t) => t.id === id);
    return wait(base ? { ...base, status } : null, 100);
  }

  addTask(task: Pick<Task, "title" | "detail" | "priority" | "group" | "due"> & { source?: string }) {
    const entry: Task = {
      id: demoId("task"),
      title: task.title,
      detail: task.detail,
      status: "Todo",
      priority: task.priority,
      group: task.group,
      due: task.due,
      source: task.source ?? "Manual",
    };
    mutateDemoStore((s) => {
      s.addedTasks.unshift(entry);
    });
    return wait(structuredClone(entry), 120);
  }
}

/* ------------------------------- Character ------------------------------- */

class DemoCharacterRepository implements CharacterRepository {
  get() {
    return wait(ops.character, 80);
  }
  update(patch: Partial<Character>) {
    void patch;
    // В демо-режиме персонаж — фиксированный вымышленный профиль.
    return wait(ops.character, 120);
  }
}

export const demoRepositories: Repositories = {
  fans: new DemoFanRepository(),
  conversations: new DemoConversationRepository(),
  content: new DemoContentRepository(),
  commerce: new DemoCommerceRepository(),
  analytics: new DemoAnalyticsRepository(),
  ai: new DemoAIRepository(),
  character: new DemoCharacterRepository(),
};
