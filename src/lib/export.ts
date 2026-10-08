import type { Fan, Memory, Message, Purchase, FanEvent } from "@/types";

/**
 * Выгрузки данных: CSV списка фанов и JSON-досье одного фана (право на доступ
 * и переносимость, GDPR art. 15/20). Чистые функции — покрыты тестами.
 */

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Одна ячейка CSV. Значения, начинающиеся с = + - @ или табуляции/возврата
 * каретки, экранируются апострофом: иначе таблица-редактор выполнит их как формулу
 * (CSV injection). Числа не трогаем — отрицательная сумма остаётся числом.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const FAN_CSV_HEADERS = [
  "id",
  "name",
  "handle",
  "source",
  "relationship",
  "status",
  "ltv_usd",
  "purchases",
  "subscription_status",
  "last_activity",
  "joined",
  "location",
  "tags",
] as const;

export function fansToCsv(fans: readonly Fan[]): string {
  return toCsv(
    FAN_CSV_HEADERS,
    fans.map((f) => [
      f.id,
      f.name,
      f.handle,
      f.source,
      f.relationship,
      f.status,
      f.ltv,
      f.purchases,
      f.subscription?.status ?? "None",
      f.lastActivity,
      f.joined,
      f.location,
      f.tags.join("; "),
    ]),
  );
}

/** Всё, что хранится о фане. Используется и для экспорта, и для проверки перед удалением. */
export interface FanDossier {
  exportedAt: string;
  fan: Fan;
  memories: Memory[];
  events: FanEvent[];
  purchases: Purchase[];
  conversations: { id: string; channel: string; messages: Message[] }[];
}

export function fanDossierToJson(dossier: FanDossier): string {
  return `${JSON.stringify(dossier, null, 2)}\n`;
}

/** Безопасное имя файла: только латиница, цифры, дефис. */
export function exportFileName(kind: "fans" | "fan", stamp: string, fanId?: string): string {
  const safeStamp = stamp.replace(/[^0-9T-]/g, "").slice(0, 19);
  const safeId = fanId ? `-${fanId.replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}` : "";
  return `mara-os-${kind}${safeId}-${safeStamp}`;
}
