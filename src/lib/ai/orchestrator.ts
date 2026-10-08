import type { AIProvider } from "./provider";
import { CharacterAgent } from "./character-agent";
import { ConversationAgent } from "./conversation-agent";
import { MemoryAgent } from "./memory-agent";
import { SalesAgent } from "./sales-agent";
import { ContentAgent } from "./content-agent";
import { AnalyticsAgent } from "./analytics-agent";
import { MockAIProvider } from "./mock";
import type {
  AiRunLogger,
  CharacterContext,
  ConversationAgentResult,
  ConversationTurn,
  FanContext,
  MemoryAgentResult,
  MemoryFact,
  SalesAgentResult,
} from "./types";

/**
 * AI Orchestrator — точка входа конвейеров агентов.
 *
 *   Event → Orchestrator → Character Agent → Conversation / Sales / Memory
 *         → Result → (human approval в UI) → Action
 *
 * Никаких монолитов: каждый агент — отдельный класс, оркестратор только
 * прокидывает контекст и собирает результат. Provider подменяемый —
 * без ключа всё работает на MockAIProvider.
 */
export class AiOrchestrator {
  readonly characterAgent = new CharacterAgent();
  readonly conversationAgent: ConversationAgent;
  readonly memoryAgent: MemoryAgent;
  readonly salesAgent: SalesAgent;
  readonly contentAgent: ContentAgent;
  readonly analyticsAgent: AnalyticsAgent;

  constructor(
    readonly provider: AIProvider = new MockAIProvider(),
    logger?: AiRunLogger,
  ) {
    this.conversationAgent = new ConversationAgent(provider, this.characterAgent, logger);
    this.memoryAgent = new MemoryAgent(provider, logger);
    this.salesAgent = new SalesAgent(provider, logger);
    this.contentAgent = new ContentAgent(provider, this.characterAgent, logger);
    this.analyticsAgent = new AnalyticsAgent(provider, logger);
  }
}

export interface ReplyPipelineInput {
  character: CharacterContext;
  fan: FanContext;
  memories: MemoryFact[];
  history: ConversationTurn[];
  offers: { id: string; name: string; price: number; type: string }[];
}

export interface ReplyPipelineResult {
  draft: ConversationAgentResult;
  sales: SalesAgentResult;
  memory: MemoryAgentResult;
  /** true — ответы получены от mock-провайдера (демо, без AI-ключа). */
  mock: boolean;
}

/**
 * Полный конвейер «новое сообщение фана → черновик ответа».
 * Черновик всегда ждёт одобрения человека в инбоксе — автосенда нет.
 */
export async function runReplyPipeline(
  orchestrator: AiOrchestrator,
  input: ReplyPipelineInput,
): Promise<ReplyPipelineResult> {
  const draft = await orchestrator.conversationAgent.reply({
    character: input.character,
    fan: input.fan,
    memories: input.memories,
    history: input.history,
    recentPurchases: input.fan.purchases,
    hasActiveSubscription: input.fan.hasActiveSubscription,
  });

  const sales = await orchestrator.salesAgent.decide({
    fan: input.fan,
    recentMessages: input.history.slice(-8),
    offers: input.offers,
  });

  const memory = await orchestrator.memoryAgent.extract({
    history: input.history,
    existingMemories: input.memories,
  });

  return { draft, sales, memory, mock: orchestrator.provider.isMock };
}
