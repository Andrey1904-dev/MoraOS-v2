import type { Automation, ContentItem, Episode, Memory, Message, Task, Fan } from "@/types";
import type { AiRunEntry } from "./types";

/**
 * Локальный демо-стор Mara OS.
 *
 * Базовый вымышленный датасет живёт в `src/data/*` (read-only), а действия
 * пользователя в демо-режиме (черновики AI, отправленные сообщения, статусы
 * задач и автоматизаций, новые воспоминания, запуски AI) сохраняются в
 * localStorage поверх него. Контракт тот же, что у Supabase-репозиториев:
 * интерфейс не знает, откуда пришли данные.
 */

const KEY = "mara_demo_store_v1";

export interface DemoFanEvent {
  id: string;
  fanId: string | null;
  type: string;
  title: string;
  detail: string;
  at: string;
  amount?: number;
}

export interface DemoStoreState {
  version: 1;
  /** Дописанные сообщения по conversationId (черновики + отправленные). */
  messages: Record<string, Message[]>;
  readConversations: string[];
  memories: Record<string, Memory[]>;
  taskStatus: Record<string, Task["status"]>;
  addedTasks: Task[];
  automationState: Record<string, { status: Automation["status"]; lastRun: string; runs: number }>;
  aiRuns: AiRunEntry[];
  contentDrafts: ContentItem[];
  contentStatus: Record<string, ContentItem["status"]>;
  addedEpisodes: Episode[];
  fansRelationship: Record<string, Fan["relationship"]>;
  events: DemoFanEvent[];
  /** Фаны, чьи данные «удалены» в демо (право на удаление): скрываются из всех экранов. */
  erasedFanIds: string[];
}

const EMPTY: DemoStoreState = {
  version: 1,
  messages: {},
  readConversations: [],
  memories: {},
  taskStatus: {},
  addedTasks: [],
  automationState: {},
  aiRuns: [],
  contentDrafts: [],
  contentStatus: {},
  addedEpisodes: [],
  fansRelationship: {},
  events: [],
  erasedFanIds: [],
};

let cache: DemoStoreState | null = null;

function load(): DemoStoreState {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoStoreState;
      if (parsed && parsed.version === 1) {
        cache = { ...structuredClone(EMPTY), ...parsed };
        return cache;
      }
    }
  } catch {
    /* localStorage может быть недоступен */
  }
  cache = structuredClone(EMPTY);
  return cache;
}

function persist(): void {
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* хранилище может быть переполнено — работаем в памяти */
  }
}

/** Читает текущее состояние стора. */
export function demoStore(): DemoStoreState {
  return load();
}

/** Применяет мутацию к стору и сохраняет его. */
export function mutateDemoStore<T>(fn: (state: DemoStoreState) => T): T {
  const state = load();
  const result = fn(state);
  persist();
  return result;
}

/** Полный сброс демо-данных до вымышленного датасета (кнопка в Settings). */
export function resetDemoStore(): void {
  cache = structuredClone(EMPTY);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  // Fire demo_reset event (fire-and-forget, must not throw).
  void (async () => {
    try {
      const { trackEvent } = await import("@/lib/events");
      await trackEvent({ type: "demo_reset", entityType: "system" });
    } catch {
      /* ignore */
    }
  })();
}

export const demoId = (prefix: string): string =>
  `${prefix}_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
