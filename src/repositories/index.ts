import { isDemoActive } from "@/lib";
import { demoRepositories } from "./demo";
import { supabaseRepositories } from "./supabase";
import type { Repositories } from "./types";

/**
 * Сервис-локатор слоя данных Mara OS.
 *
 * Компоненты не знают, откуда приходят данные: локатор отдаёт либо
 * Supabase-реализацию, либо демо-репозитории поверх вымышленного датасета
 * — в зависимости от текущего режима бэкенда (`src/lib/index.ts`).
 * Переключение «демо ⇄ облако» происходит на лету: каждый вызов метода
 * смотрит актуальный режим.
 */
export function getRepositories(): Repositories {
  return isDemoActive() ? demoRepositories : supabaseRepositories;
}

/** Прокси: вызов методов репозиториев всегда идёт к активной реализации. */
const delegate = <T extends object>(pick: (repos: Repositories) => T): T =>
  new Proxy({} as T, {
    get(_target, prop) {
      const active = pick(getRepositories()) as Record<PropertyKey, unknown>;
      return active[prop as keyof T];
    },
  });

export const repositories: Repositories = {
  fans: delegate((r) => r.fans),
  conversations: delegate((r) => r.conversations),
  content: delegate((r) => r.content),
  commerce: delegate((r) => r.commerce),
  analytics: delegate((r) => r.analytics),
  ai: delegate((r) => r.ai),
  character: delegate((r) => r.character),
};

export type { Repositories } from "./types";
export {
  actionQueue,
  story,
  character as staticCharacter,
} from "@/data/ops-compat";
