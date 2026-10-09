/**
 * Интеграция сайта с Telegram Mini Apps (клиентская часть, без React).
 *
 * Принципы (ТЗ v1.1, разделы 4 и 7):
 *   • в обычном браузере модуль ничего не меняет: SDK даже не загружается;
 *   • SDK `telegram-web-app.js` грузится только когда страница открыта Telegram
 *     (в URL есть параметры запуска `tgWebApp*` или они сохранены SDK в
 *     sessionStorage после перезагрузки внутри Mini App);
 *   • любая ошибка/отсутствие SDK или метода — тихая деградация, а не белый экран;
 *   • `initData` / `initDataUnsafe` НЕ используются для авторизации: вход на сайт —
 *     штатный Supabase. `start_param` — непривилегированный ключ из белого списка.
 *
 * React-слой (BackButton, отложенный deep link) — в components/TelegramMiniAppBridge.tsx.
 */

/* ------------------------------------------------------------------ типы --- */

type Listener = (...args: unknown[]) => void

interface Insets {
  top: number
  bottom: number
  left: number
  right: number
}

/** Подмножество Telegram.WebApp, которое использует сайт. Все поля — необязательные. */
export interface TelegramWebApp {
  initData?: string
  initDataUnsafe?: { start_param?: string }
  version?: string
  platform?: string
  colorScheme?: 'light' | 'dark'
  isExpanded?: boolean
  isFullscreen?: boolean
  viewportHeight?: number
  viewportStableHeight?: number
  safeAreaInset?: Partial<Insets>
  contentSafeAreaInset?: Partial<Insets>
  isVersionAtLeast?(version: string): boolean
  ready?(): void
  expand?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  enableClosingConfirmation?(): void
  disableClosingConfirmation?(): void
  showConfirm?(message: string, callback?: (ok: boolean) => void): void
  showAlert?(message: string, callback?: () => void): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink?(url: string): void
  disableVerticalSwipes?(): void
  enableVerticalSwipes?(): void
  onEvent?(event: string, handler: Listener): void
  offEvent?(event: string, handler: Listener): void
  BackButton?: {
    isVisible?: boolean
    show?(): void
    hide?(): void
    onClick?(handler: () => void): void
    offClick?(handler: () => void): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/* ------------------------------------------------------------ константы --- */

export const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
/** Сколько ждать SDK перед первым рендером внутри Telegram. Потом сайт стартует без него. */
export const TELEGRAM_SDK_TIMEOUT_MS = 3500

/** Фирменные поверхности сайта (см. index.css): фон страницы и нижней панели. */
export const MINI_APP_COLORS = {
  background: '#08090A',
  header: '#08090A',
  bottomBar: '#0B0C0E',
} as const

/**
 * Белый список коротких ключей `startapp` / `?screen=` → внутренние маршруты.
 * Произвольные пути, URL и команды не исполняются.
 */
export const START_ROUTES: Readonly<Record<string, string>> = Object.freeze({
  home: '/',
  dashboard: '/',
  fans: '/fans',
  messages: '/conversations',
  conversations: '/conversations',
  inbox: '/conversations',
  content: '/content',
  episodes: '/episodes',
  analytics: '/analytics',
  revenue: '/revenue',
  tasks: '/tasks',
  ai: '/ai',
  automations: '/automations',
  settings: '/settings',
  bot: '/settings',
  telegram: '/settings',
})

/** Маршруты, на которых BackButton скрыт (корень кабинета и экран входа). */
export const ROOT_ROUTES: readonly string[] = ['/', '/auth']

/** Маршруты сайта, которые можно восстановить из hash при старте Mini App. */
const KNOWN_ROUTES = new Set(['/', '/auth', ...Object.values(START_ROUTES)])

/** Параметр запроса, которым бот открывает конкретный раздел через кнопку web_app. */
export const SCREEN_QUERY_PARAM = 'screen'

const SDK_SESSION_KEY = '__telegram__initParams'
const LAUNCH_PARAM_RE = /(?:^|[#?&])tgWebApp[A-Za-z]*=/
const START_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/

/* ------------------------------------------------------ чистые функции --- */

/** Ключ `startapp` → разрешённый маршрут или null (пусто/неизвестно/мусор). */
export function resolveStartRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim()
  if (!START_KEY_RE.test(key)) return null
  const normalized = key.toLowerCase()
  return Object.prototype.hasOwnProperty.call(START_ROUTES, normalized) ? START_ROUTES[normalized] : null
}

/** Есть ли в URL параметры запуска, которые Telegram добавляет при открытии Mini App. */
export function hasLaunchParams(hash: string, search = ''): boolean {
  return LAUNCH_PARAM_RE.test(hash) || LAUNCH_PARAM_RE.test(search)
}

/**
 * Разбирает hash, который получил Mini App: `#tgWebAppData=…`, `#/fans?tgWebApp…`
 * или `#/fans&tgWebApp…`. Возвращает маршрут HashRouter (только из известных)
 * и признак того, что в hash были параметры Telegram.
 */
export function splitLaunchHash(hash: string): { route: string | null; hadLaunchParams: boolean } {
  const raw = hash.replace(/^#/, '')
  const hadLaunchParams = LAUNCH_PARAM_RE.test(`#${raw}`)
  const cut = raw.search(/[?&]/)
  let path = cut >= 0 ? raw.slice(0, cut) : raw
  if (path.includes('=')) path = ''
  try {
    path = decodeURIComponent(path)
  } catch {
    path = ''
  }
  const route = path.startsWith('/') && KNOWN_ROUTES.has(path) ? path : null
  return { route, hadLaunchParams }
}

/** Родительский маршрут для BackButton без известной внутренней истории. */
export function parentRoute(pathname: string): string {
  if (ROOT_ROUTES.includes(pathname)) return pathname
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length <= 1) return '/'
  return `/${parts.slice(0, -1).join('/')}`
}

/**
 * Решение для BackButton: показывать ли кнопку и что делать по нажатию.
 * `historyIndex` — индекс записи React Router в пределах сайта (history.state.idx).
 */
export function backButtonPlan(input: {
  pathname: string
  historyIndex: number
  pendingHandlers: number
}): { visible: boolean; action: 'handler' | 'history' | 'parent' | 'none' } {
  if (input.pendingHandlers > 0) return { visible: true, action: 'handler' }
  if (ROOT_ROUTES.includes(input.pathname)) return { visible: false, action: 'none' }
  if (input.historyIndex > 0) return { visible: true, action: 'history' }
  return { visible: true, action: 'parent' }
}

/** Проверка версии Bot API клиента; без `isVersionAtLeast` считаем, что не поддерживается. */
export function supports(webApp: TelegramWebApp | null | undefined, version: string): boolean {
  if (!webApp || typeof webApp.isVersionAtLeast !== 'function') return false
  try {
    return webApp.isVersionAtLeast(version)
  } catch {
    return false
  }
}

/**
 * Страница действительно открыта клиентом Telegram как Mini App.
 * Сам скрипт SDK создаёт `Telegram.WebApp` и в обычном браузере (platform=unknown,
 * пустой initData), поэтому одного наличия объекта недостаточно. Это определение
 * среды для UI, а НЕ доказательство подлинности: подпись initData клиент не проверяет.
 */
export function isTelegramEnvironment(webApp: TelegramWebApp | null | undefined): webApp is TelegramWebApp {
  if (!webApp || typeof webApp !== 'object') return false
  const hasInitData = typeof webApp.initData === 'string' && webApp.initData.length > 0
  const knownPlatform = typeof webApp.platform === 'string' && webApp.platform !== '' && webApp.platform !== 'unknown'
  return hasInitData || knownPlatform
}

/* --------------------------------------------------------- состояние --- */

let activeWebApp: TelegramWebApp | null = null
let pendingStartRoute: string | null = null

/** Экземпляр SDK, если сайт запущен как Mini App и инициализация прошла; иначе null. */
export function getMiniApp(): TelegramWebApp | null {
  return activeWebApp
}

export function isMiniApp(): boolean {
  return activeWebApp !== null
}

/** Маршрут из deep link, который нужно открыть после штатной проверки авторизации. */
export function takePendingStartRoute(): string | null {
  const route = pendingStartRoute
  pendingStartRoute = null
  return route
}

export function peekPendingStartRoute(): string | null {
  return pendingStartRoute
}

/** Безопасный вызов необязательного метода SDK. */
function safeCall(label: string, fn: () => void): boolean {
  try {
    fn()
    return true
  } catch (error) {
    if (import.meta.env?.DEV) console.warn(`[mini-app] ${label}:`, error)
    return false
  }
}

/* ------------------------------------------------- стек обработчиков «Назад» --- */

type BackHandler = () => void
const backHandlers: BackHandler[] = []
const backListeners = new Set<() => void>()

/**
 * Регистрирует локальный обработчик BackButton (например, закрыть открытое окно).
 * Последний зарегистрированный срабатывает первым. Возвращает функцию снятия.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler)
  backListeners.forEach((listener) => listener())
  return () => {
    const index = backHandlers.lastIndexOf(handler)
    if (index >= 0) backHandlers.splice(index, 1)
    backListeners.forEach((listener) => listener())
  }
}

export function backHandlerCount(): number {
  return backHandlers.length
}

/** Выполняет верхний локальный обработчик. true — нажатие обработано. */
export function runTopBackHandler(): boolean {
  const handler = backHandlers[backHandlers.length - 1]
  if (!handler) return false
  handler()
  return true
}

export function subscribeBackHandlers(listener: () => void): () => void {
  backListeners.add(listener)
  return () => backListeners.delete(listener)
}

/* ------------------------------------------- подтверждение закрытия --- */

let closingConfirmationRequests = 0

/**
 * Включает подтверждение закрытия Mini App, пока есть несохранённые изменения.
 * Счётчик запросов: выключается, когда все формы освободили запрос.
 */
export function requestClosingConfirmation(): () => void {
  const webApp = activeWebApp
  if (!webApp || !supports(webApp, '6.2')) return () => {}
  closingConfirmationRequests++
  if (closingConfirmationRequests === 1) {
    safeCall('enableClosingConfirmation', () => webApp.enableClosingConfirmation?.())
  }
  let released = false
  return () => {
    if (released) return
    released = true
    closingConfirmationRequests = Math.max(0, closingConfirmationRequests - 1)
    if (closingConfirmationRequests === 0) {
      safeCall('disableClosingConfirmation', () => webApp.disableClosingConfirmation?.())
    }
  }
}

/** Лимит текста нативного попапа Telegram. */
const POPUP_MESSAGE_LIMIT = 256

function clampPopupMessage(message: string): string {
  return message.length > POPUP_MESSAGE_LIMIT ? `${message.slice(0, POPUP_MESSAGE_LIMIT - 1)}…` : message
}

/**
 * Подтверждение действия. Внутри Mini App — нативный попап Telegram (`showConfirm`,
 * Bot API 6.2+): `window.confirm` во встроенных WebView работает не везде и может
 * молча возвращать false. В браузере — обычный `window.confirm`.
 */
export function confirmAction(message: string): Promise<boolean> {
  const webApp = activeWebApp
  if (webApp && supports(webApp, '6.2') && typeof webApp.showConfirm === 'function') {
    return new Promise((resolve) => {
      const ok = safeCall('showConfirm', () =>
        webApp.showConfirm!(clampPopupMessage(message), (confirmed) => resolve(Boolean(confirmed))),
      )
      if (!ok) resolve(typeof window !== 'undefined' ? window.confirm(message) : false)
    })
  }
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false)
}

/** @deprecated используйте confirmAction */
export const confirmDiscard = confirmAction

/** Короткое уведомление: попап Telegram в Mini App, `window.alert` в браузере. */
export function notify(message: string): Promise<void> {
  const webApp = activeWebApp
  if (webApp && supports(webApp, '6.2') && typeof webApp.showAlert === 'function') {
    return new Promise((resolve) => {
      const ok = safeCall('showAlert', () => webApp.showAlert!(clampPopupMessage(message), () => resolve()))
      if (!ok) {
        window.alert(message)
        resolve()
      }
    })
  }
  if (typeof window !== 'undefined') window.alert(message)
  return Promise.resolve()
}

/* ---------------------------------------------------------- внешние ссылки --- */

const TELEGRAM_LINK_RE = /^https:\/\/t\.me\//i

/**
 * Как открыть ссылку внутри Mini App: t.me — внутри Telegram, внешние http(s) —
 * во внешнем браузере, свои адреса и прочие схемы — штатно.
 */
export function classifyLink(href: string, currentOrigin: string): 'telegram' | 'external' | 'internal' | 'other' {
  let url: URL
  try {
    url = new URL(href, currentOrigin)
  } catch {
    return 'other'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'other'
  if (url.origin === currentOrigin) return 'internal'
  if (TELEGRAM_LINK_RE.test(url.href)) return 'telegram'
  return 'external'
}

/** Открывает ссылку средствами Telegram; true — ссылка обработана. */
export function openLinkInTelegram(href: string, currentOrigin: string = window.location.origin): boolean {
  const webApp = activeWebApp
  if (!webApp || !supports(webApp, '6.1')) return false
  const kind = classifyLink(href, currentOrigin)
  if (kind === 'telegram' && typeof webApp.openTelegramLink === 'function') {
    return safeCall('openTelegramLink', () => webApp.openTelegramLink!(new URL(href).href))
  }
  if (kind === 'external' && typeof webApp.openLink === 'function') {
    return safeCall('openLink', () => webApp.openLink!(new URL(href, currentOrigin).href))
  }
  return false
}

/** Открывает адрес во внешнем браузере (даже если это адрес самого сайта). */
export function openInExternalBrowser(url: string): boolean {
  const webApp = activeWebApp
  if (!webApp || !supports(webApp, '6.1') || typeof webApp.openLink !== 'function') return false
  return safeCall('openLink', () => webApp.openLink!(url))
}

/** Перехват кликов по <a>: внешние и t.me-ссылки уходят в Telegram (а не в WebView). */
function installLinkInterceptor(doc: Document, win: Window): void {
  doc.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const anchor = target && typeof target.closest === 'function' ? (target.closest('a[href]') as HTMLAnchorElement | null) : null
      if (!anchor || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href') ?? ''
      if (!href || href.startsWith('#')) return
      if (openLinkInTelegram(anchor.href || href, win.location.origin)) event.preventDefault()
    },
    true,
  )
}

/* ----------------------------------------------- вертикальные свайпы --- */

let swipeLocks = 0

/**
 * Пока открыто модальное окно, свайп вниз внутри него не должен сворачивать
 * Mini App (Bot API 7.7+). Возвращает функцию снятия блокировки.
 */
export function lockVerticalSwipes(): () => void {
  const webApp = activeWebApp
  if (!webApp || !supports(webApp, '7.7') || typeof webApp.disableVerticalSwipes !== 'function') return () => {}
  swipeLocks++
  if (swipeLocks === 1) safeCall('disableVerticalSwipes', () => webApp.disableVerticalSwipes!())
  let released = false
  return () => {
    if (released) return
    released = true
    swipeLocks = Math.max(0, swipeLocks - 1)
    if (swipeLocks === 0) safeCall('enableVerticalSwipes', () => webApp.enableVerticalSwipes?.())
  }
}

/* ------------------------------------------------------------- файлы --- */

/** Платформы, где WebView Telegram не умеет скачивать Blob-файлы. */
const NO_BLOB_DOWNLOAD_PLATFORMS = new Set(['android', 'android_x', 'ios'])

/** Нужна ли альтернатива обычному скачиванию файла. */
export function needsFileFallback(): boolean {
  return Boolean(activeWebApp && NO_BLOB_DOWNLOAD_PLATFORMS.has(String(activeWebApp.platform)))
}

/**
 * Передаёт файл пользователю внутри мобильного Telegram: системное меню
 * «Поделиться» (Web Share API с файлами), иначе — предложение открыть кабинет
 * в браузере, где скачивание работает.
 */
export async function deliverFileInMiniApp(file: File, browserUrl: string): Promise<'shared' | 'cancelled' | 'browser' | 'dismissed'> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { canShare?(data: ShareData): boolean }) : null
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    let canShareFile = false
    try {
      canShareFile = nav.canShare({ files: [file] })
    } catch {
      canShareFile = false
    }
    if (canShareFile) {
      try {
        await nav.share({ files: [file], title: file.name })
        return 'shared'
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      }
    }
  }
  const open = await confirmAction('Внутри Telegram файлы не скачиваются. Открыть Mara OS в браузере, чтобы сохранить экспорт?')
  if (open && openInExternalBrowser(browserUrl)) return 'browser'
  return 'dismissed'
}

/* ----------------------------------------------------- viewport и оформление --- */

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Переносит размеры и системные отступы SDK в CSS-переменные сайта.
 * Вызывается на старте и при каждом viewportChanged / safeAreaChanged / resize,
 * поэтому высота не фиксируется по единственному измерению.
 */
export function applyViewport(webApp: TelegramWebApp, root: HTMLElement = document.documentElement): void {
  const style = root.style
  const stable = num(webApp.viewportStableHeight) || num(webApp.viewportHeight)
  const inner = typeof window !== 'undefined' ? num(window.innerHeight) : 0
  if (stable) {
    style.setProperty('--tg-app-viewport-stable-height', `${stable}px`)
    // Если WebView выше видимой области (Mini App частично свёрнут) — поднимаем
    // закреплённые снизу элементы на скрытую часть.
    style.setProperty('--tg-app-bottom-offset', `${Math.max(0, Math.round(inner - stable))}px`)
  } else {
    style.removeProperty('--tg-app-viewport-stable-height')
    style.setProperty('--tg-app-bottom-offset', '0px')
  }

  const safe = webApp.safeAreaInset ?? {}
  const content = webApp.contentSafeAreaInset ?? {}
  // Верхние отступы нужны только в полноэкранном режиме: в обычном шапка Telegram
  // находится вне WebView.
  const top = num(content.top) + (webApp.isFullscreen ? num(safe.top) : 0)
  style.setProperty('--tg-app-inset-top', `${top}px`)
  style.setProperty('--tg-app-inset-bottom', `${num(safe.bottom) + num(content.bottom)}px`)
  style.setProperty('--tg-app-inset-left', `${num(safe.left) + num(content.left)}px`)
  style.setProperty('--tg-app-inset-right', `${num(safe.right) + num(content.right)}px`)
}

/**
 * Согласует цвета системных областей Telegram с тёмной поверхностью сайта.
 * Сайт всегда тёмный, поэтому цвета фиксированные и не ухудшают контраст.
 */
export function applyColors(webApp: TelegramWebApp, root: HTMLElement = document.documentElement): void {
  if (webApp.colorScheme === 'light' || webApp.colorScheme === 'dark') {
    root.dataset.tgColorScheme = webApp.colorScheme
  }
  // До 6.9 шапка принимает только ключи темы Telegram (в светлой теме — белая
  // шапка над тёмным сайтом), поэтому hex-цвет задаём только с 6.9.
  if (supports(webApp, '6.9') && typeof webApp.setHeaderColor === 'function') {
    safeCall('setHeaderColor', () => webApp.setHeaderColor!(MINI_APP_COLORS.header))
  }
  if (supports(webApp, '6.1') && typeof webApp.setBackgroundColor === 'function') {
    safeCall('setBackgroundColor', () => webApp.setBackgroundColor!(MINI_APP_COLORS.background))
  }
  if (supports(webApp, '7.10') && typeof webApp.setBottomBarColor === 'function') {
    safeCall('setBottomBarColor', () => webApp.setBottomBarColor!(MINI_APP_COLORS.bottomBar))
  }
}

/* ------------------------------------------------------- инициализация --- */

/**
 * Инициализирует уже загруженный SDK. Возвращает WebApp или null, если это не
 * Telegram. Не бросает исключений.
 */
export function initMiniApp(
  webApp: TelegramWebApp | null | undefined,
  { root = document.documentElement, win = window }: { root?: HTMLElement; win?: Window } = {},
): TelegramWebApp | null {
  if (!isTelegramEnvironment(webApp)) return null
  activeWebApp = webApp
  root.classList.add('tg-mini-app')
  if (webApp.platform) root.dataset.tgPlatform = String(webApp.platform).replace(/[^a-z0-9_-]/gi, '')

  safeCall('expand', () => webApp.expand?.())
  applyColors(webApp, root)
  applyViewport(webApp, root)

  const onViewport = () => applyViewport(webApp, root)
  const onTheme = () => applyColors(webApp, root)
  if (typeof webApp.onEvent === 'function') {
    safeCall('onEvent', () => {
      webApp.onEvent!('viewportChanged', onViewport)
      webApp.onEvent!('safeAreaChanged', onViewport)
      webApp.onEvent!('contentSafeAreaChanged', onViewport)
      webApp.onEvent!('fullscreenChanged', onViewport)
      webApp.onEvent!('themeChanged', onTheme)
    })
  }
  win.addEventListener('resize', onViewport)
  win.addEventListener('orientationchange', onViewport)
  if (win.document) safeCall('linkInterceptor', () => installLinkInterceptor(win.document, win))
  return webApp
}

let readySent = false
/** Сообщает Telegram, что минимальный интерфейс готов (скрывает заглушку загрузки). */
export function markMiniAppReady(): void {
  if (readySent || !activeWebApp) return
  readySent = true
  const webApp = activeWebApp
  safeCall('ready', () => webApp.ready?.())
}

/**
 * Нормализует адрес при старте Mini App: убирает параметры Telegram из hash
 * (SDK уже сохранил их в sessionStorage) и служебный `?screen=`, выставляет
 * начальный маршрут HashRouter. Deep link запоминается для открытия после входа.
 */
export function prepareStartLocation(webApp: TelegramWebApp, win: Window = window): string | null {
  const { location, history } = win
  const { route: hashRoute, hadLaunchParams } = splitLaunchHash(location.hash)

  let query: URLSearchParams | null = null
  try {
    query = new URLSearchParams(location.search)
  } catch {
    query = null
  }
  const screenKey = query?.get(SCREEN_QUERY_PARAM) ?? null
  const startKey = webApp.initDataUnsafe?.start_param

  // Приоритет: startapp из прямой ссылки → ?screen= из кнопки бота → маршрут из hash.
  const target = resolveStartRoute(startKey) ?? resolveStartRoute(screenKey) ?? hashRoute ?? null

  const hadScreen = query?.has(SCREEN_QUERY_PARAM) ?? false
  if (hadLaunchParams || hadScreen) {
    if (query) query.delete(SCREEN_QUERY_PARAM)
    const search = query && query.toString() ? `?${query.toString()}` : ''
    const hash = `#${target ?? '/'}`
    safeCall('replaceState', () => history.replaceState(null, '', `${location.pathname}${search}${hash}`))
  }

  pendingStartRoute = target && target !== '/' ? target : null
  return target
}

/** Нужно ли вообще пытаться грузить SDK (признаки запуска из Telegram). */
export function shouldLoadSdk(win: Window = window): boolean {
  if (hasLaunchParams(win.location.hash, win.location.search)) return true
  try {
    return Boolean(win.sessionStorage.getItem(SDK_SESSION_KEY))
  } catch {
    return false
  }
}

/** Загружает официальный SDK. Никогда не отклоняется: при ошибке/таймауте — null. */
export function loadTelegramSdk(timeoutMs = TELEGRAM_SDK_TIMEOUT_MS, doc: Document = document): Promise<TelegramWebApp | null> {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve((typeof window !== 'undefined' && window.Telegram?.WebApp) || null)
    }
    const timer = setTimeout(finish, timeoutMs)
    try {
      const script = doc.createElement('script')
      script.src = TELEGRAM_SDK_URL
      script.async = true
      script.onload = finish
      script.onerror = finish
      doc.head.appendChild(script)
    } catch {
      finish()
    }
  })
}

/**
 * Точка входа из main.tsx: вызывается ДО первого рендера, чтобы HashRouter не
 * перезаписал hash с параметрами запуска раньше, чем их прочитает SDK.
 * В обычном браузере завершается мгновенно и ничего не делает.
 */
export async function bootstrapTelegramMiniApp(): Promise<TelegramWebApp | null> {
  try {
    if (typeof window === 'undefined' || !shouldLoadSdk(window)) return null
    const sdk = await loadTelegramSdk()
    const webApp = initMiniApp(sdk)
    if (webApp) prepareStartLocation(webApp)
    return webApp
  } catch {
    return null
  }
}

/** Только для тестов: сброс модульного состояния. */
export function __resetMiniAppForTests(): void {
  activeWebApp = null
  pendingStartRoute = null
  readySent = false
  closingConfirmationRequests = 0
  swipeLocks = 0
  backHandlers.splice(0, backHandlers.length)
  backListeners.clear()
}
