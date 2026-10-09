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
        return "hook: Блокнот говорит, что я должна себе ещё 41 такое утро.\ncaption: 6 утра. Зал был пуст, счётчик долга — нет. Эпизод выходит в пятницу.";
      case "analytics":
        return "Фэшн-рилсы дают на 42% больше заходов в профиль, чем лайфстайл-рилсы с теми же подписями. На следующей неделе сместите микс в сторону фэшна.";
      default:
        return request.prompt.slice(0, 120);
    }
  }

  private replyDraft(fan: string, prompt: string): string {
    const last = this.extract(prompt, "Last message");
    const level = (this.extract(prompt, "Relationship") || "fan").toLowerCase();
    const opener =
      level === "inner_circle" || level === "favorite"
        ? `${fan.split(" ")[0]}, ты уже знаешь правила блокнота`
        : level === "visitor" || level === "follower"
          ? `Добро пожаловать — ты нашёл год подсчёта`
          : `Привет — 43-я страница, а цифра почти не сдвинулась`;
    const reaction = /gym|workout|6am|зал|тренир/i.test(last)
      ? "Да, подход в 6 утра настоящий — штанга дешевле психотерапии и не спрашивает про мой долг."
      : /debt|27k|money|\$|долг/i.test(last)
        ? "Цифра настоящая, округлённая, чтобы моя гордость ещё держалась. Блокнот видит всё первым."
        : /episode|friday|story|эпизод|пятниц/i.test(last)
          ? "В пятницу. Тизер уже заставил меня нервничать, а это обычно значит, что он достаточно честный."
          : "Почерк становится злее, а цифра — меньше. В этом и есть весь сюжет.";
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
            ? { memory: `Фан упомянул: ${last.slice(0, 120)}`, category: "personal", importance: 0.6 }
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
        return { memory: `Фан упомянул: ${last.slice(0, 120)}`, category, importance: 0.6 };
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
                ? "Фан спросил про доступ или цену — намерение явное, предложите текущий PPV-дроп."
                : `${purchases} покупок раньше и активная переписка — тёплый момент для набора выходного дня.`,
              confidence: 0.84,
            }
          : {
              action: purchases > 0 ? "nurture" : "wait",
              offer_id: null,
              reason:
                purchases > 0
                  ? "Повторный покупатель, активных сигналов покупки нет — поддерживайте сюжет вместо давления с оффером."
                  : "Истории покупок и сигналов покупки нет — сначала прогрейте через эпизоды.",
              confidence: 0.78,
            };
      }
      case "content": {
        return {
          hooks: [
            "Теперь я знаю цену каждому часу своей жизни. Этот стоит $0.",
            "Блокнот говорит, что я должна себе ещё 41 такое утро.",
            "Зарплата $54k. Долг $27k. Один красный блокнот.",
          ],
          caption:
            "6 утра. Зал был пуст, счётчик долга — нет. Сегодня 43-я страница: почерк становится злее, а цифра — меньше. Эпизод выходит в пятницу.",
          cta: "Следить за отсчётом",
          variants: [
            { angle: "vulnerable", hook: "Иногда блокнот побеждает. На этой неделе — нет." },
            { angle: "confident", hook: "Закрыла февраль за выходные. Блокнот заметил." },
          ],
        };
      }
      case "analytics": {
        return {
          insights: [
            {
              kind: "recommendation",
              title: "Фэшн-рилсы обгоняют лайфстайл на 42% по заходам в профиль",
              body: "За текущий период фэшн-нарезки дали на 42% больше заходов в профиль на показ, чем лайфстайл-нарезки с идентичными подписями.",
              recommendation: "На следующей неделе поднимите долю фэшна в коротких форматах с 20% до 35%; хуки про квартиру оставьте для сторис.",
              confidence: 0.86,
            },
            {
              kind: "insight",
              title: "Покупатели PPV конвертируются после 3+ обменов сообщениями",
              body: "Фаны с тремя и более обмена сообщениями за неделю покупают PPV в 2,8 раза чаще базового уровня.",
              recommendation: "Для новых фанов из Telegram ставьте глубину ответов выше объёма рассылок.",
              confidence: 0.8,
            },
          ],
        };
      }
      default:
        return { note: "mock-провайдер: неизвестный агент", agent: request.agent };
    }
  }
}
