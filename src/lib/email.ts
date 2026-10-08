/**
 * Подготовка email перед отправкой в Supabase Auth.
 *
 * Задачи модуля:
 *  1. Не мешать регистрации на любые домены — в первую очередь российские
 *     (mail.ru, yandex.ru, bk.ru, list.ru, inbox.ru, rambler.ru, .рф …).
 *  2. Чинить типовые ошибки ввода с телефона: пробелы, «mailto:», Caps Lock,
 *     русская раскладка (кириллические буквы, визуально неотличимые от латиницы),
 *     домен, набранный по-русски («майл.ру»).
 *  3. Заранее ловить адреса, которые Supabase гарантированно отклонит
 *     (example.com / test.com и прочие тестовые домены → email_address_invalid),
 *     чтобы не тратить лимит писем и не пугать пользователя серверной ошибкой.
 */

/** Кириллические буквы, визуально совпадающие с латинскими (русская раскладка) */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  һ: 'h',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
}

/** Популярные домены, набранные по-русски */
const CYRILLIC_DOMAINS: Record<string, string> = {
  'майл.ру': 'mail.ru',
  'мэйл.ру': 'mail.ru',
  'маил.ру': 'mail.ru',
  'яндекс.ру': 'yandex.ru',
  'яндекс.рф': 'yandex.ru',
  'гмайл.ком': 'gmail.com',
  'джимейл.ком': 'gmail.com',
  'рамблер.ру': 'rambler.ru',
  'бк.ру': 'bk.ru',
  'лист.ру': 'list.ru',
  'инбокс.ру': 'inbox.ru',
}

/** Опечатки в популярных доменах → как правильно */
const DOMAIN_TYPOS: Record<string, string> = {
  'mail.ry': 'mail.ru',
  'mail.ri': 'mail.ru',
  'mail.tu': 'mail.ru',
  'mail.u': 'mail.ru',
  'mail.rru': 'mail.ru',
  'mai.ru': 'mail.ru',
  'mial.ru': 'mail.ru',
  'maill.ru': 'mail.ru',
  'mali.ru': 'mail.ru',
  'yandex.ry': 'yandex.ru',
  'yandex.ri': 'yandex.ru',
  'yandx.ru': 'yandex.ru',
  'yadex.ru': 'yandex.ru',
  'yandex.com.ru': 'yandex.ru',
  'ya.ry': 'ya.ru',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.ru': 'gmail.com',
  'gmail.copm': 'gmail.com',
  'ramble.ru': 'rambler.ru',
  'inbox.ry': 'inbox.ru',
  'bk.ry': 'bk.ru',
  'list.ry': 'list.ru',
}

/**
 * Домены, которые сервер Supabase Auth отклоняет с кодом `email_address_invalid`
 * («Example and test domains are currently not supported»).
 */
const REJECTED_BY_SUPABASE = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'test.org',
  'test.net',
  'email.com',
  'localhost',
  'localhost.com',
  'mail.com.test',
])

const hasCyrillic = (s: string) => /[\u0400-\u04FF]/.test(s)

/** Приводит адрес к каноническому виду, который примет Supabase */
export function normalizeEmail(raw: string): string {
  let value = (raw ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^[<"'\s]+|[>"'\s.,;]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

  if (!value) return ''

  // «ivan(at)mail.ru» / «ivan собака mail.ru» — иногда так пишут, чтобы скрыть адрес
  value = value.replace(/\(at\)|\[at\]|\{at\}|собака/gi, '@')

  const at = value.lastIndexOf('@')
  if (at < 0) return value

  let local = value.slice(0, at)
  let domain = value.slice(at + 1)

  // запятая вместо точки в домене — частая опечатка на мобильной клавиатуре
  domain = domain.replace(/,/g, '.').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '')

  // домен, набранный по-русски целиком
  if (CYRILLIC_DOMAINS[domain]) {
    domain = CYRILLIC_DOMAINS[domain]
  } else if (hasCyrillic(domain)) {
    // «….ру» → «.ru» (кроме настоящей доменной зоны .рф — она остаётся IDN)
    domain = domain.replace(/\.ру$/, '.ru').replace(/\.сом$/, '.com')
  }

  // кириллица, визуально неотличимая от латиницы (набрано в русской раскладке)
  const deHomoglyph = (s: string) => s.replace(/[\u0400-\u04FF]/g, (ch) => HOMOGLYPHS[ch] ?? ch)
  const localFixed = deHomoglyph(local)
  const domainFixed = deHomoglyph(domain)
  if (!hasCyrillic(localFixed)) local = localFixed
  if (!hasCyrillic(domainFixed)) domain = domainFixed

  return `${local}@${domain}`
}

/** Домен с национальными символами (например, почта.рф) → punycode (xn--…) */
function toAsciiDomain(domain: string): string {
  if (!/[^\u0020-\u007F]/.test(domain)) return domain
  try {
    // URL приводит интернационализированные домены к punycode
    const host = new URL(`http://${domain}`).hostname
    return host || domain
  } catch {
    return domain
  }
}

const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD_RE = /^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/

export interface EmailCheck {
  /** Нормализованный адрес, который надо отправлять в Supabase */
  email: string
  /** Адрес корректен и его можно отправлять */
  ok: boolean
  /** Причина отказа (показывается как ошибка) */
  error?: string
  /** Мягкая подсказка (не блокирует отправку) */
  suggestion?: string
  /** Исправленный вариант адреса для кнопки «Исправить» */
  fixed?: string
}

/**
 * Полная проверка адреса: нормализация + валидация.
 * Валидация намеренно широкая — отсекаем только то, что точно не пройдёт.
 */
export function checkEmail(raw: string): EmailCheck {
  const email = normalizeEmail(raw)

  if (!email) return { email, ok: false, error: 'Введите email' }

  const parts = email.split('@')
  if (parts.length < 2) {
    return { email, ok: false, error: 'В адресе не хватает символа @ — например, ivan@mail.ru' }
  }
  if (parts.length > 2) {
    return { email, ok: false, error: 'В адресе больше одного символа @' }
  }

  const [local, domainRaw] = parts
  if (!local) return { email, ok: false, error: 'Перед @ должно быть имя ящика — например, ivan@mail.ru' }
  if (!domainRaw) return { email, ok: false, error: 'После @ должен быть домен — например, mail.ru' }

  if (hasCyrillic(local)) {
    return {
      email,
      ok: false,
      error: 'Имя ящика (до @) должно быть на латинице — похоже, включена русская раскладка',
    }
  }
  if (!LOCAL_RE.test(local)) {
    return { email, ok: false, error: 'В части до @ есть недопустимые символы' }
  }

  const domain = toAsciiDomain(domainRaw)
  if (!domain.includes('.')) {
    return { email, ok: false, error: 'В домене не хватает точки — например, mail.ru' }
  }

  const labels = domain.split('.')
  if (labels.some((l) => !LABEL_RE.test(l))) {
    return { email, ok: false, error: `Некорректный домен «${domainRaw}»` }
  }
  if (!TLD_RE.test(labels[labels.length - 1])) {
    return { email, ok: false, error: `Некорректная доменная зона «.${labels[labels.length - 1]}»` }
  }

  if (REJECTED_BY_SUPABASE.has(domain)) {
    return {
      email,
      ok: false,
      error:
        `Supabase не принимает тестовые домены (${domain}). ` +
        'Укажите настоящую почту — подойдёт любая: mail.ru, yandex.ru, bk.ru, gmail.com…',
    }
  }

  // адрес валиден; возможно, в домене опечатка — подсказываем, но не блокируем
  const normalized = `${local}@${domain === domainRaw ? domainRaw : domain}`
  const typoFix = DOMAIN_TYPOS[domainRaw]
  if (typoFix) {
    return {
      email: normalized,
      ok: true,
      suggestion: `Возможно, вы имели в виду ${local}@${typoFix}`,
      fixed: `${local}@${typoFix}`,
    }
  }

  return { email: normalized, ok: true }
}

/** Домен адреса (для подсказок «проверьте папку Спам в mail.ru») */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at < 0 ? '' : email.slice(at + 1)
}

/** Ссылка на веб-почту — чтобы сразу открыть входящие */
export function webmailUrl(email: string): string | null {
  const domain = emailDomain(email)
  const known: Record<string, string> = {
    'mail.ru': 'https://e.mail.ru/inbox/',
    'bk.ru': 'https://e.mail.ru/inbox/',
    'list.ru': 'https://e.mail.ru/inbox/',
    'inbox.ru': 'https://e.mail.ru/inbox/',
    'internet.ru': 'https://e.mail.ru/inbox/',
    'yandex.ru': 'https://mail.yandex.ru/',
    'ya.ru': 'https://mail.yandex.ru/',
    'yandex.com': 'https://mail.yandex.com/',
    'gmail.com': 'https://mail.google.com/',
    'rambler.ru': 'https://mail.rambler.ru/',
    'outlook.com': 'https://outlook.live.com/mail/',
    'hotmail.com': 'https://outlook.live.com/mail/',
    'icloud.com': 'https://www.icloud.com/mail',
  }
  return known[domain] ?? null
}
