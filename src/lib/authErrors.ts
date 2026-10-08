import { PASSWORD_MIN_LENGTH } from './passwordPolicy'
/**
 * Человеческие сообщения об ошибках Supabase Auth.
 *
 * Самое важное здесь — лимиты встроенного отправителя писем Supabase:
 *  • «email rate limit exceeded» (over_email_send_rate_limit) — встроенный
 *    отправитель шлёт не больше 2 писем в час НА ВЕСЬ ПРОЕКТ;
 *  • «Email address not authorized» (email_address_not_authorized) — встроенный
 *    отправитель доставляет письма только на адреса участников команды проекта,
 *    поэтому регистрация «постороннего» ящика (в том числе на mail.ru /
 *    yandex.ru) обрывается ещё до отправки.
 *
 * Лечится это не в коде, а в настройках проекта: выключить подтверждение email
 * (Authentication → Sign In / Up → Confirm email) или подключить свой SMTP.
 * Инструкция — в README, раздел «Регистрация: письма и лимиты»,
 * а также скрипт `npm run supabase:auth`.
 */

export type AuthProblemKind =
  | 'email_rate_limit'
  | 'email_not_authorized'
  | 'email_invalid'
  | 'user_exists'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'signup_disabled'
  | 'request_rate_limit'
  | 'too_soon'
  | 'network'
  | 'unknown'

export class AuthProblem extends Error {
  readonly kind: AuthProblemKind
  /** Пояснение: что именно происходит и что делать */
  readonly detail?: string
  /** Через сколько секунд имеет смысл повторить */
  readonly retryAfterSec?: number
  /** Ошибка связана с отправкой письма — помогает отключение подтверждения/SMTP */
  readonly mailIssue: boolean
  /** Исходное сообщение сервера (для отладки) */
  readonly raw?: string

  constructor(
    kind: AuthProblemKind,
    message: string,
    opts: { detail?: string; retryAfterSec?: number; mailIssue?: boolean; raw?: string } = {},
  ) {
    super(message)
    this.name = 'AuthProblem'
    this.kind = kind
    this.detail = opts.detail
    this.retryAfterSec = opts.retryAfterSec
    this.mailIssue = opts.mailIssue ?? false
    this.raw = opts.raw
  }
}

/** Что делать владельцу проекта, если Supabase не может отправить письмо */
export const MAIL_FIX_HINT =
  'Чтобы регистрация работала с любой почтой (включая .ru), в настройках проекта Supabase нужно ' +
  'выключить подтверждение email либо подключить свой SMTP.'

interface RawAuthError {
  message?: string
  code?: string
  status?: number
  name?: string
}

const asRawError = (error: unknown): RawAuthError => {
  if (typeof error === 'string') return { message: error }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    return {
      message: typeof e.message === 'string' ? e.message : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      name: typeof e.name === 'string' ? e.name : undefined,
    }
  }
  return {}
}

/** Преобразует ошибку supabase-js в понятную пользователю проблему */
export function toAuthProblem(error: unknown): AuthProblem {
  if (error instanceof AuthProblem) return error

  const { message = '', code = '', status } = asRawError(error)
  const msg = message.toLowerCase()
  const raw = message || undefined

  // «For security purposes, you can only request this after 42 seconds.»
  const afterSeconds = /after (\d+) seconds?/i.exec(message)
  if (afterSeconds) {
    const sec = Number(afterSeconds[1])
    return new AuthProblem('too_soon', `Слишком часто — повторите через ${sec} с`, {
      detail: 'Supabase разрешает повторную отправку письма не чаще, чем раз в минуту.',
      retryAfterSec: sec,
      mailIssue: true,
      raw,
    })
  }

  if (code === 'over_email_send_rate_limit' || msg.includes('email rate limit exceeded')) {
    return new AuthProblem('email_rate_limit', 'Supabase временно не отправляет письма: превышен лимит', {
      detail:
        'Встроенный отправитель Supabase шлёт не больше 2 писем в час на весь проект — лимит израсходован. ' +
        'Можно подождать около часа, но правильнее убрать письмо из регистрации. ' +
        MAIL_FIX_HINT,
      retryAfterSec: 60 * 60,
      mailIssue: true,
      raw,
    })
  }

  if (code === 'email_address_not_authorized' || msg.includes('not authorized')) {
    return new AuthProblem('email_not_authorized', 'На этот адрес Supabase не может отправить письмо', {
      detail:
        'Без своего SMTP встроенный отправитель Supabase доставляет письма только на адреса участников ' +
        'команды проекта, поэтому обычные ящики (mail.ru, yandex.ru, gmail.com) он отвергает. ' +
        MAIL_FIX_HINT,
      mailIssue: true,
      raw,
    })
  }

  if (code === 'email_address_invalid' || (msg.includes('email address') && msg.includes('invalid'))) {
    return new AuthProblem('email_invalid', 'Supabase отклонил этот адрес', {
      detail:
        'Тестовые домены (example.com, test.com и подобные) не поддерживаются. ' +
        'Укажите реальную почту — подойдёт любая, включая mail.ru, yandex.ru, bk.ru.',
      raw,
    })
  }

  if (msg.includes('unable to validate email')) {
    return new AuthProblem('email_invalid', 'Некорректный email', {
      detail: 'Проверьте раскладку клавиатуры и лишние пробелы: адрес должен быть вида ivan@mail.ru.',
      raw,
    })
  }

  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) {
    return new AuthProblem('user_exists', 'Этот email уже зарегистрирован', {
      detail: 'Войдите с этим адресом и паролем — регистрироваться заново не нужно.',
      raw,
    })
  }

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return new AuthProblem('invalid_credentials', 'Неверный email или пароль', { raw })
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return new AuthProblem('email_not_confirmed', 'Email ещё не подтверждён', {
      detail:
        'Откройте ссылку из письма Supabase — загляните и в папку «Спам». Письмо не приходит? ' +
        MAIL_FIX_HINT,
      mailIssue: true,
      raw,
    })
  }

  if (code === 'weak_password' || msg.includes('password should be')) {
    return new AuthProblem('weak_password', `Пароль слишком короткий — минимум ${PASSWORD_MIN_LENGTH} символов`, { raw })
  }

  if (code === 'signup_disabled' || code === 'email_provider_disabled' || msg.includes('signups not allowed')) {
    return new AuthProblem('signup_disabled', 'Регистрация отключена в настройках проекта Supabase', {
      detail: 'Включите её: Authentication → Sign In / Up → Allow new users to sign up.',
      raw,
    })
  }

  if (code === 'over_request_rate_limit' || (status === 429 && !msg.includes('email'))) {
    return new AuthProblem('request_rate_limit', 'Слишком много попыток — подождите пару минут', {
      detail: 'Supabase ограничивает частоту запросов с одного адреса.',
      retryAfterSec: 120,
      raw,
    })
  }

  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return new AuthProblem('network', 'Нет связи с сервером', {
      detail: 'Проверьте интернет и доступность проекта Supabase, затем повторите.',
      raw,
    })
  }

  return new AuthProblem('unknown', message || 'Не удалось выполнить запрос', { raw })
}
