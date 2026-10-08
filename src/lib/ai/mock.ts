import type { AIGenerateRequest, AIGenerateResult, AIStructuredResult, AIProvider } from "./provider";
import { parseJsonFromText } from "./provider";

/**
 * MockAIProvider — правдоподобные детерминированные ответы без API-ключа.
 *
 * Позволяет полностью тестировать интерфейс и конвейеры агентов до
 * подключения реального провайдера. Каждый результат помечен `mock: true`,
 * чтобы UI никогда не выдавал демонстрационный ответ за настоящий вызов AI.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly isMock = true;

  constructor(private readonly latency = 350) {}

  async generate(request: AIGenerateRequest): Promise<AIGenerateResult> {
    const start = Date.now();
    const text = request.schema
      ? JSON.stringify(this.mockStructured(request), null, 0)
      : this.mockText(request);
    await new Promise((r) => setTimeout(r, this.latency));
    return {
      text,
      mock: true,
      model: "mock-structured-v1",
      tokens: Math.round((request.prompt.length + text.length) / 4),
      durationMs: Date.now() - start,
    };
  }

  async generateStructured<T>(
    request: AIGenerateRequest,
    parse: (raw: unknown) => T,
  ): Promise<AIStructuredResult<T>> {
    const start = Date.now();
    const result = await this.generate(request);
    return { data: parse(parseJsonFromText(result.text)), mock: true, model: result.model, durationMs: Date.now() - start };
  }

  async embed(text: string): Promise<number[]> {
    // Детерминированный «эмбеддинг» на хэше — достаточно для демо-поиска.
    const vec = new Array<number>(64).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 64] += Math.sin(text.charCodeAt(i) * (i + 1));
    }
    const norm = Math.hypot(...vec) || 1;
    return vec.map((v) => v / norm);
  }

  /* ------------------------------------------------------------------ */
  /* Генерация правдоподобных ответов по имени агента и содержимому      */
  /* промпта. Детерминизм: тот же контекст → тот же ответ.               */
  /* ------------------------------------------------------------------ */

  private extract(prompt: string, label: string): string {
    const re = new RegExp(`${label}:\\s*(.+)`, "i");
    return re.exec(prompt)?.[1]?.trim() ?? "";
  }

  private mockText(request: AIGenerateRequest): string {
    const fan = this.extract(request.prompt, "Fan") || "there";
    switch (request.agent) {
      case "conversation":
        return this.replyDraft(fan, request.prompt);
      case "content":
        return "hook: The notebook says I owe myself 41 more mornings.\ncaption: 6am. The gym was empty, the debt counter was not. Episode drops Friday.";
      case "analytics":
        return "Fashion reels drive 42% more profile visits than lifestyle reels on the same captions. Shift next week's mix toward fashion.";
      default:
        return request.prompt.slice(0, 120);
    }
  }

  private replyDraft(fan: string, prompt: string): string {
    const last = this.extract(prompt, "Last message");
    const level = (this.extract(prompt, "Relationship") || "fan").toLowerCase();
    const opener =
      level === "inner_circle" || level === "favorite"
        ? `${fan.split(" ")[0]}, you know the notebook rules by now`
        : level === "visitor" || level === "follower"
          ? `Welcome in — you found the year of counting`
          : `Hey — page 43 and the number barely moved`;
    const reaction = /gym|workout|6am/i.test(last)
      ? "Yes, the 6am set is real — the barbell is cheaper than therapy, and it does not ask about my debt."
      : /debt|27k|money|\$/i.test(last)
        ? "Real number, rounded to keep my pride on life support. The notebook sees everything first."
        : /episode|friday|story/i.test(last)
          ? "Friday. The teaser already made me nervous, which usually means it is honest enough."
          : "The handwriting gets angrier but the number gets smaller — that is the whole plot.";
    return `${opener}. ${reaction}`;
  }

  private mockStructured(request: AIGenerateRequest): Record<string, unknown> {
    const fan = this.extract(request.prompt, "Fan") || "the fan";
    const last = this.extract(request.prompt, "Last message");
    switch (request.agent) {
      case "conversation": {
        const buying = /buy|price|cost|offer|ppv|subscribe/i.test(last);
        const memoryHint = /night shift|work (?:at|from)|live in|from [A-Z]|gym|dress/i.test(last);
        return {
          reply: this.replyDraft(fan, request.prompt),
          intent: /hi|hello|hey/i.test(last)
            ? "greeting"
            : buying
              ? "price_check"
              : /love|cute|beautiful|miss you/i.test(last)
                ? "flirting"
                : /episode|content|post/i.test(last)
                  ? "story_followup"
                  : "smalltalk",
          sales_action: buying ? "recommend_offer" : "none",
          memory_candidate: memoryHint
            ? { memory: `Fan mentioned: ${last.slice(0, 120)}`, category: "personal", importance: 0.6 }
            : null,
          relationship_level: this.extract(request.prompt, "Relationship").toLowerCase().replace(" ", "_") || "fan",
          confidence: 0.91,
        };
      }
      case "memory": {
        const hasFact = /live|work|night shift|favorite|bought|gym|dress|from/i.test(last);
        if (!hasFact) return { memory: null };
        const category = /gym|workout/i.test(last)
          ? "interests"
          : /live|from/i.test(last)
            ? "location"
            : /dress|content|favorite/i.test(last)
              ? "content preference"
              : /bought|buy/i.test(last)
                ? "purchase habit"
                : "lifestyle";
        return { memory: `Fan mentioned: ${last.slice(0, 120)}`, category, importance: 0.6 };
      }
      case "sales": {
        const purchases = Number(this.extract(request.prompt, "Purchases"));
        const buying = /buy|price|cost|offer|ppv|subscribe|content/i.test(last);
        const hot = buying || purchases >= 3;
        return hot
          ? {
              action: "recommend_offer",
              offer_id: null,
              reason: buying
                ? "Fan asked about access/price — intent is explicit, recommend the current PPV drop."
                : `${purchases} previous purchases and an active thread — a warm moment for the weekend bundle.`,
              confidence: 0.84,
            }
          : {
              action: purchases > 0 ? "nurture" : "wait",
              offer_id: null,
              reason:
                purchases > 0
                  ? "Repeat buyer, no active buying signals — keep the storyline warm instead of pushing an offer."
                  : "No purchase history and no buying signals — nurture through episodes first.",
              confidence: 0.78,
            };
      }
      case "content": {
        return {
          hooks: [
            "I price every hour of my life now. This one costs $0.",
            "The notebook says I owe myself 41 more mornings like this.",
            "$54k salary. $27k debt. One red notebook.",
          ],
          caption:
            "6am. The gym was empty, the debt counter was not. Page 43 today — the handwriting is getting angrier but the number gets smaller. Episode drops Friday.",
          cta: "Follow the countdown",
          variants: [
            { angle: "vulnerable", hook: "Sometimes the notebook wins. Not this week." },
            { angle: "confident", hook: "Paid February off in a weekend. The notebook noticed." },
          ],
        };
      }
      case "analytics": {
        return {
          insights: [
            {
              kind: "recommendation",
              title: "Fashion reels outperform lifestyle by 42% in profile visits",
              body: "Across the current period, fashion-led cuts drove 42% more profile visits per impression than lifestyle cuts with identical captions.",
              recommendation: "Raise fashion share of short-form from 20% to 35% next week; keep apartment hooks for stories.",
              confidence: 0.86,
            },
            {
              kind: "insight",
              title: "PPV buyers convert after 3+ exchanges",
              body: "Fans with three or more message exchanges in a week buy PPV at 2.8× the base rate.",
              recommendation: "Prioritise reply depth over broadcast volume for new Telegram fans.",
              confidence: 0.8,
            },
          ],
        };
      }
      default:
        return { note: "mock provider: unknown agent", agent: request.agent };
    }
  }
}
