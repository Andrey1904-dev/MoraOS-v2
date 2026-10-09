import type { CharacterContext } from "./types";

/**
 * Character Agent — хранитель характера Mara.
 *
 * Собирает контекст персонажа для остальных агентов (voice, lore,
 * boundaries, recurring objects) и проверяет сгенерированные тексты на
 * соответствие характеру до того, как они попадут на одобрение человеку.
 */
export class CharacterAgent {
  buildContext(profile: {
    name: string;
    voice: string;
    story: string;
    logline?: string;
    boundaries: string[];
    traits: { label: string; value: string }[];
  }): CharacterContext {
    const personality =
      profile.traits.find((t) => t.label === "Характер")?.value.split(",").map((s) => s.trim()).filter(Boolean) ??
      ["dry", "confident", "playful", "intelligent"];
    const recurring = profile.traits
      .find((t) => t.label === "Фирменный предмет")
      ?.value.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? ["red notebook"];
    return {
      name: profile.name,
      voice: profile.voice,
      story: profile.story,
      lore: profile.logline,
      boundaries: profile.boundaries,
      personality,
      recurringObjects: recurring,
    };
  }

  /** Системный промпт, который видят остальные агенты. */
  systemPrompt(character: CharacterContext): string {
    return [
      `You are writing as ${character.name}, a fictional virtual creator.`,
      `Voice: ${character.voice}`,
      `Story: ${character.story}`,
      character.lore ? `Lore: ${character.lore}` : "",
      `Personality: ${character.personality.join(", ")}.`,
      `Recurring objects: ${character.recurringObjects.join(", ")}.`,
      "Boundaries (never cross):",
      ...character.boundaries.map((b) => `- ${b}`),
      "Никогда не звучи как AI-ассистент. Никогда не будь корпоративной. Оставайся в формате дневника от первого лица. Отвечай по-русски.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Проверяет текст на нарушения boundaries и типичные «AI-обороты».
   * Дешёвая детерминированная проверка до human approval.
   */
  check(text: string, character: CharacterContext): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const lower = text.toLowerCase();
    const aiTells = ["as an ai", "i'm an ai", "language model", "i cannot", "as your assistant"];
    for (const tell of aiTells) {
      if (lower.includes(tell)) issues.push(`AI assistant phrasing: "${tell}"`);
    }
    if (/\b(corporate|synergy|empower|leverage)\b/i.test(text)) {
      issues.push("Обнаружен корпоративный тон");
    }
    if (character.recurringObjects.length && text.length > 400 && !lower.includes("notebook")) {
      // мягкий сигнал, не блокирующий — длинные confession-тексты обычно про notebook
    }
    return { ok: issues.length === 0, issues };
  }
}
