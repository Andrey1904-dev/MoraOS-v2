/** Formatting helpers — single source of truth for number/date display. */

export const currency = (n: number, opts: { compact?: boolean; cents?: boolean } = {}) => {
  if (opts.compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  }
  return n
    .toLocaleString("ru-RU", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: opts.cents ? 2 : 0,
      maximumFractionDigits: opts.cents ? 2 : 0,
    })
    .replace(/\u00a0/g, " ");
};

export const number = (n: number, compact = false) =>
  compact && Math.abs(n) >= 1000
    ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} тыс.`
    : n.toLocaleString("ru-RU");

export const percent = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

/**
 * Русская форма множественного числа: pluralRu(2, ["фан", "фана", "фанов"]) → "фана".
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const signed = (n: number, suffix = "%") =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}${suffix}`;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Относительное время вида «5 мин назад» из ISO-строки или литерала «2m». */
export function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  if (diff < MIN) return "только что";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} ${pluralRu(Math.floor(diff / MIN), ["мин", "мин", "мин"])} назад`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} ${pluralRu(Math.floor(diff / HOUR), ["час", "часа", "часов"])} назад`;
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d} ${pluralRu(d, ["день", "дня", "дней"])} назад`;
  }
  return new Date(iso).toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
}

export const shortDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("ru-RU", { month: "short", day: "numeric" })
    : "—";

export const longDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("ru-RU", { month: "long", day: "numeric", year: "numeric" })
    : "—";

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Deterministic pseudo-random in [0,1) from a string seed — stable mock variation. */
export function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
