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
      case "strategy": {
        return {
          ideas: [
            { id: "idea_1", title: "The morning the notebook almost won", angle: "vulnerable confession", purpose: "Build emotional connection with audience", episodeLink: null, experimental: false },
            { id: "idea_2", title: "I counted every dollar for 30 days — here is what broke", angle: "data-driven story", purpose: "Show the math behind the mission", episodeLink: null, experimental: false },
            { id: "idea_3", title: "What $54k actually looks like in Chicago", angle: "reality check", purpose: "Relatable money content", episodeLink: null, experimental: false },
            { id: "idea_4", title: "The red notebook rule I broke last Tuesday", angle: "narrative twist", purpose: "Show vulnerability through rule-breaking", episodeLink: null, experimental: true },
            { id: "idea_5", title: "6am gym vs 6am scrolling — the hourly cost", angle: "comparison", purpose: "Interactive hook that invites engagement", episodeLink: null, experimental: false },
          ],
          reasoning: "These ideas mix vulnerability, data, and interactive hooks — all within Mara's voice and storyline.",
        };
      }
      case "hooks": {
        return {
          hooks: [
            { id: "hook_1", text: "The notebook says I owe myself 43 more mornings. Today almost didn't count.", type: "vulnerable confession", audienceInterest: "high", topicRelevance: "high", clicheRisk: "low", recommendation: "Strong opener — leads with emotion and stakes." },
            { id: "hook_2", text: "I priced my Tuesday at $14.27. That's what an hour of my life costs right now.", type: "surprising number", audienceInterest: "high", topicRelevance: "high", clicheRisk: "low", recommendation: "Specific numbers hook — use for data-driven audience." },
            { id: "hook_3", text: "Do you track your life in hours or dollars? I track mine in both.", type: "question", audienceInterest: "medium", topicRelevance: "high", clicheRisk: "medium", recommendation: "Good for engagement — invites replies." },
            { id: "hook_4", text: "The red notebook has a rule I broke last week. I'm telling you because you earned it.", type: "bold statement", audienceInterest: "high", topicRelevance: "medium", clicheRisk: "low", recommendation: "Creates insider feeling — use sparingly." },
            { id: "hook_5", text: "6am. Empty gym. The debt counter didn't move but I did.", type: "scene-setting", audienceInterest: "medium", topicRelevance: "high", clicheRisk: "low", recommendation: "Visual opener — pair with strong imagery." },
          ],
        };
      }
      case "script": {
        return {
          hook: "The notebook says I owe myself 43 more mornings. Today almost didn't count.",
          setup: "Page 43. The handwriting gets worse when the numbers barely move.",
          mainBeats: [
            { label: "The alarm", text: "5:55am. The phone buzzed and I almost let it win.", durationSec: 5, visualDirection: "Close-up on phone screen, dark room" },
            { label: "The choice", text: "But the notebook was on the nightstand. It doesn't negotiate.", durationSec: 8, visualDirection: "Red notebook on nightstand, morning light" },
            { label: "The gym", text: "6am. Empty. Just me and the math.", durationSec: 6, visualDirection: "Wide shot of empty gym" },
          ],
          emotionalTurn: "For a second I thought about adding today's hour to the debt column. Then I wrote it in the 'bought back' column instead.",
          ending: "43 more mornings. The number went down by one.",
          cta: "Follow the countdown.",
          visualDirection: "Morning light, minimal color grading, red notebook as recurring visual anchor.",
          onScreenText: ["Day 323", "$27,000 → $26,847", "Page 43"],
          caption: "The notebook doesn't negotiate. Neither do I. Page 43 today.",
          estimatedDurationSec: 30,
        };
      }
      case "platform_adapter": {
        return {
          variants: [
            {
              platform: "TikTok",
              text: "6am. Empty gym. The debt counter didn't move but I did. The notebook says 43 more mornings — today I gave it one less. #debtcountdown #marasjournal #365days",
              format: "Short-form vertical video, 15-30s",
              cta: "Follow for daily countdown",
              visualNotes: "Quick cuts, text overlays on beat, trending audio underneath",
              platformConstraints: ["Keep under 60s for maximum reach", "Text overlays critical for sound-off viewing"],
            },
            {
              platform: "Instagram",
              text: "Page 43.\n\nThe handwriting gets worse when the numbers barely move. But this morning I woke up at 5:55 and chose the gym over the snooze button.\n\nThe red notebook doesn't negotiate. Neither do I.\n\n43 more mornings. One just went into the 'bought back' column.\n\nFollow the countdown — link in bio.",
              format: "Reel, 30-60s with editorial caption",
              cta: "Follow for the full 365-day journey",
              visualNotes: "Slightly more polished than TikTok, editorial color grading",
              platformConstraints: ["Caption can be longer here", "Check current Reels length guidelines"],
            },
            {
              platform: "Threads",
              text: "The notebook says I owe myself 43 more mornings.\n\nToday almost didn't count. I hit snooze at 5:55am. Then I looked at the red notebook on the nightstand and it doesn't negotiate.\n\n6am gym. Empty. Just me and the math.\n\nFor a second I thought about adding today to the debt column. Instead I wrote it in 'bought back.'\n\nThe number went down by one. That's the whole plot.",
              format: "Text post, diary-style",
              cta: "Reply if you track something daily",
              visualNotes: "No video needed — this is a text-first moment",
              platformConstraints: ["No character limit concerns for this length", "No hashtags needed on Threads"],
            },
          ],
        };
      }
      case "captions": {
        return {
          captions: [
            { style: "short", text: "The notebook doesn't negotiate. Neither do I. Page 43 today. #debtcountdown #marasjournal" },
            { style: "extended", text: "Page 43.\n\nThe handwriting gets worse when the numbers barely move. But the number does move — slowly, stubbornly, one bought-back hour at a time.\n\n43 more mornings. That's the deal I made with myself." },
            { style: "conversational", text: "ok so I almost hit snooze this morning. the notebook was literally staring at me from the nightstand. you know that feeling when something you wrote to yourself in a moment of clarity is judging you at 5:55am? yeah. that." },
            { style: "story", text: "Day 323 of 365.\n\nThe red notebook says I owe myself 43 more mornings. Today I woke up at 5:55 and the snooze button was right there. But page 43 doesn't negotiate.\n\n$27k debt. $54k salary. One red notebook. The math is slow but it's honest." },
            { style: "engagement", text: "What's the one thing you wrote to yourself that you can't ignore anymore?\n\nMine is a red notebook that says 43 more mornings. Today it went down to 42. Slowly, stubbornly, one bought-back hour at a time.\n\nTell me yours." },
          ],
        };
      }
      case "character_check": {
        return {
          passed: true,
          score: 92,
          issues: [],
          suggestions: ["Consider adding a specific dollar amount from the debt for extra authenticity"],
        };
      }
      case "quality_check": {
        return {
          passed: true,
          score: 88,
          issues: [],
          suggestions: ["Hook is strong — keep it as is", "Consider adding a visual beat at the 10s mark for retention"],
        };
      }
      default:
        return { note: "mock provider: unknown agent", agent: request.agent };
    }
  }
}
