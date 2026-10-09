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

/** Фирменный знак Mara OS (public/logo.png): навигация, заставка, экран входа, аватар ассистента. */
export const BRAND_LOGO_URL = publicAssetUrl('logo.png')
