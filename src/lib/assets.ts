/**
 * Адреса файлов из public/ с учётом базового пути сборки.
 *
 * Сайт собирается под GitHub Pages с базой `/MoraOS-v2/` (site.config.json), поэтому
 * абсолютный путь `/logo.png` указывал бы в корень домена и не открылся бы. Адреса
 * всегда строятся от `import.meta.env.BASE_URL` (в dev это `/`). В тестовых сборках
 * esbuild подменяет `import.meta.env` без BASE_URL — тогда берём корень.
 */
export function publicAssetUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
  return `${base}/${path.replace(/^\/+/, '')}`
}

/** Фирменный знак Mara OS (public/logo.png): навигация, заставка, экран входа. */
export const BRAND_LOGO_URL = publicAssetUrl('logo.png')

/** Аватар ассистента в Telegram (public/images/): WebP с запасным JPG. */
export const TELEGRAM_ASSISTANT_AVATAR = {
  webp: publicAssetUrl('images/telegram-assistant-avatar.webp'),
  jpg: publicAssetUrl('images/telegram-assistant-avatar.jpg'),
} as const
