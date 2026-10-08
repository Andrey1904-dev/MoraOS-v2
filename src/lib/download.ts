import { deliverFileInMiniApp, isMiniApp, needsFileFallback } from "./telegram-mini-app";

export type DownloadOutcome = "downloaded" | "shared" | "cancelled" | "browser" | "dismissed";

/**
 * Отдаёт текстовый файл пользователю. В браузере — обычная загрузка Blob.
 * В мобильном Telegram Blob-загрузка не работает: файл предлагается через
 * системное «Поделиться» либо открывается сайт в браузере.
 */
export async function downloadTextFile(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
): Promise<DownloadOutcome> {
  const file = new File([content], name, { type });
  if (isMiniApp() && needsFileFallback()) {
    return deliverFileInMiniApp(file, window.location.href);
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "downloaded";
}
