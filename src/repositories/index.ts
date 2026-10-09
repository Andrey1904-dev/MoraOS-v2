import { isDemoActive } from "@/lib";
import type { Repositories } from "./types";
import * as ops from "@/data/ops-compat";

/**
 * Сервис-локатор слоя данных Mara OS.
 *
 * Компоненты не знают, откуда приходят данные. Вызов любого метода уходит к
 * активной реализации: Supabase (облако) или демо (вымышленный датасет). Выбор
 * делается в момент вызова, поэтому переключение «демо ⇄ облако» работает на лету.
 *
 * Реализации грузятся лениво (динамический import): датасет `src/data` попадает
 * в отдельный чанк и скачивается только тогда, когда демо действительно нужно.
 */

type Impl = Repositories;
const loaded: Partial<Record<"demo" | "cloud", Promise<Impl>>> = {};

function implementation(): Promise<Impl> {
  const key = isDemoActive() ? "demo" : "cloud";
  if (!loaded[key]) {
    loaded[key] =
      key === "demo"
        ? import("./demo").then((m) => m.demoRepositories as Impl)
        : import("./supabase").then((m) => m.supabaseRepositories as Impl);
  }
  return loaded[key]!;
}

/** Все методы репозиториев асинхронны, поэтому вызов возвращает Promise активной реализации. */
export function getRepositories(): Promise<Repositories> {
  return implementation();
}

type AnyMethods = Record<string, (...args: unknown[]) => unknown>;

function delegate<K extends keyof Repositories>(key: K): Repositories[K] {
  return new Proxy({} as Repositories[K], {
    get(_target, method) {
      if (typeof method !== "string") return undefined;
      return (...args: unknown[]) =>
        implementation().then((impl) => {
          const repo = impl[key] as unknown as AnyMethods;
          return repo[method](...args);
        });
    },
  });
}

export const repositories: Repositories = {
  fans: delegate("fans"),
  conversations: delegate("conversations"),
  content: delegate("content"),
  commerce: delegate("commerce"),
  analytics: delegate("analytics"),
  ai: delegate("ai"),
  character: delegate("character"),
};

export type { Repositories, RevenueSummary } from "./types";
export const actionQueue = ops.actionQueue;
export const story = ops.story;
export const staticCharacter = ops.character;
