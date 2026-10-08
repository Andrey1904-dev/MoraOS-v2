/**
 * Публичный вход слоя AI Mara OS.
 *
 * UI берёт оркестратор через `getAiOrchestrator()` — ленивый синглтон,
 * который пересоздаётся при смене режима данных (демо ⇄ облако), чтобы
 * ai_runs писались в то же хранилище, что читает интерфейс.
 */
import { repositories } from "@/repositories";
import { MockAIProvider } from "./mock";
import { AiOrchestrator } from "./orchestrator";
import type { AIProvider } from "./provider";
import type { AiRunLogger } from "./types";

let cached: { provider: AIProvider; logger: AiRunLogger; orchestrator: AiOrchestrator } | null = null;

export function getAiOrchestrator(): AiOrchestrator {
  if (!cached) {
    // В браузере реального ключа нет и быть не может (AI secret никогда не
    // попадает в VITE_*): провайдер — Mock, пока не подключён серверный
    // AI-proxy (bot server / Edge Function, переменная AI_API_KEY).
    const provider: AIProvider = new MockAIProvider();
    const logger: AiRunLogger = {
      async log(entry) {
        try {
          await repositories.ai.logRun(entry);
        } catch {
          // Лог запуска — вспомогательный канал: не ломаем UX из-за него.
        }
      },
    };
    cached = { provider, logger, orchestrator: new AiOrchestrator(provider, logger) };
  }
  return cached.orchestrator;
}

export * from "./provider";
export * from "./types";
export { MockAIProvider } from "./mock";
export { AiOrchestrator, runReplyPipeline } from "./orchestrator";
export { CharacterAgent } from "./character-agent";
export { ConversationAgent } from "./conversation-agent";
export { MemoryAgent } from "./memory-agent";
export { SalesAgent } from "./sales-agent";
export { ContentAgent } from "./content-agent";
export { AnalyticsAgent } from "./analytics-agent";
