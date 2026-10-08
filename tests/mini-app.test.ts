/**
 * Тесты клиентской интеграции Telegram Mini App (src/lib/telegram-mini-app.ts).
 * Браузер не нужен: окно, документ и SDK подменяются минимальными заглушками.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  START_ROUTES,
  TELEGRAM_SDK_URL,
  __resetMiniAppForTests,
  applyColors,
  applyViewport,
  backButtonPlan,
  bootstrapTelegramMiniApp,
  classifyLink,
  confirmAction,
  lockVerticalSwipes,
  needsFileFallback,
  openLinkInTelegram,
  getMiniApp,
  hasLaunchParams,
  initMiniApp,
  isTelegramEnvironment,
  loadTelegramSdk,
  markMiniAppReady,
  parentRoute,
  peekPendingStartRoute,
  prepareStartLocation,
  pushBackHandler,
  requestClosingConfirmation,
  resolveStartRoute,
  runTopBackHandler,
  shouldLoadSdk,
  splitLaunchHash,
  supports,
  takePendingStartRoute,
  type TelegramWebApp,
} from '../src/lib/telegram-mini-app'

/* ------------------------------------------------------------- заглушки --- */

function fakeRoot() {
  const props = new Map<string, string>()
  const classes = new Set<string>()
  return {
    props,
    classes,
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
    },
    classList: { add: (c: string) => void classes.add(c) },
  }
}

function fakeWindow(href: string, session: Record<string, string> = {}) {
  const url = new URL(href)
  const listeners: string[] = []
  const replaced: string[] = []
  const win = {
    location: { hash: url.hash, search: url.search, pathname: url.pathname },
    history: {
      replaceState: (_s: unknown, _t: string, next: string) => {
        replaced.push(next)
      },
    },
    sessionStorage: { getItem: (k: string) => session[k] ?? null },
    addEventListener: (type: string) => void listeners.push(type),
    innerHeight: 800,
  }
  return { win: win as unknown as Window, listeners, replaced }
}

type Calls = string[]

function fakeWebApp(overrides: Partial<TelegramWebApp> = {}, version = '8.0') {
  const calls: Calls = []
  const events = new Map<string, (() => void)[]>()
  const backClicks: (() => void)[] = []
  const webApp: TelegramWebApp = {
    initData: 'query_id=1&user=%7B%7D&auth_date=1&hash=abc',
    initDataUnsafe: {},
    platform: 'android',
    version,
    colorScheme: 'dark',
    viewportHeight: 700,
    viewportStableHeight: 640,
    safeAreaInset: { top: 24, bottom: 20, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast: (v: string) => {
      const a = version.split('.').map(Number)
      const b = v.split('.').map(Number)
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0)
        if (d !== 0) return d > 0
      }
      return true
    },
    ready: () => void calls.push('ready'),
    expand: () => void calls.push('expand'),
    setHeaderColor: (c: string) => void calls.push(`header:${c}`),
    setBackgroundColor: (c: string) => void calls.push(`bg:${c}`),
    setBottomBarColor: (c: string) => void calls.push(`bottom:${c}`),
    enableClosingConfirmation: () => void calls.push('confirm:on'),
    disableVerticalSwipes: () => void calls.push('swipes:off'),
    enableVerticalSwipes: () => void calls.push('swipes:on'),
    showConfirm: (message: string, cb?: (ok: boolean) => void) => {
      calls.push(`popup:${message}`)
      cb?.(true)
    },
    openLink: (url: string) => void calls.push(`link:${url}`),
    openTelegramLink: (url: string) => void calls.push(`tglink:${url}`),
    disableClosingConfirmation: () => void calls.push('confirm:off'),
    onEvent: (name: string, handler: () => void) => {
      events.set(name, [...(events.get(name) ?? []), handler])
    },
    BackButton: {
      show: () => void calls.push('back:show'),
      hide: () => void calls.push('back:hide'),
      onClick: (h: () => void) => void backClicks.push(h),
      offClick: () => {},
    },
    ...overrides,
  }
  return { webApp, calls, events, backClicks }
}

const g = globalThis as unknown as Record<string, unknown>

beforeEach(() => {
  __resetMiniAppForTests()
  delete g.window
  delete g.document
})

/* --------------------------------------------------------- deep links --- */

describe('startapp / screen: белый список маршрутов', () => {
  it('известные ключи превращаются в разрешённые маршруты', () => {
    assert.equal(resolveStartRoute('fans'), '/fans')
    assert.equal(resolveStartRoute('messages'), '/conversations')
    assert.equal(resolveStartRoute('content'), '/content')
    assert.equal(resolveStartRoute('analytics'), '/analytics')
    assert.equal(resolveStartRoute('FANS'), '/fans')
    assert.equal(resolveStartRoute('telegram'), '/settings')
  })

  it('неизвестные, пустые и опасные значения не исполняются', () => {
    for (const bad of [
      '', '   ', 'unknown', '/fans', '../auth', 'https://evil.example', 'javascript:alert(1)',
      'fans/../../x', '__proto__', 'constructor', 'toString', 'a'.repeat(65), null, undefined, 42, {},
    ]) {
      assert.equal(resolveStartRoute(bad), null, String(bad))
    }
  })

  it('все маршруты белого списка — внутренние пути сайта', () => {
    for (const route of Object.values(START_ROUTES)) assert.match(route, /^\/[a-z]*$/)
  })
})

describe('параметры запуска в hash (совместимость с HashRouter)', () => {
  it('распознаёт параметры Telegram в hash и query', () => {
    assert.equal(hasLaunchParams('#tgWebAppData=abc&tgWebAppVersion=8.0'), true)
    assert.equal(hasLaunchParams('#/fans?tgWebAppVersion=8.0'), true)
    assert.equal(hasLaunchParams('#/fans&tgWebAppPlatform=ios'), true)
    assert.equal(hasLaunchParams('', '?tgWebAppStartParam=garage'), true)
    assert.equal(hasLaunchParams('#/fans'), false)
    assert.equal(hasLaunchParams('#/content?tab=modeling'), false)
  })

  it('выделяет только известный маршрут', () => {
    assert.deepEqual(splitLaunchHash('#tgWebAppData=x&tgWebAppVersion=8.0'), { route: null, hadLaunchParams: true })
    assert.deepEqual(splitLaunchHash('#/fans?tgWebAppVersion=8.0'), { route: '/fans', hadLaunchParams: true })
    assert.deepEqual(splitLaunchHash('#/settings&tgWebAppVersion=8.0'), { route: '/settings', hadLaunchParams: true })
    assert.deepEqual(splitLaunchHash('#/admin?tgWebAppVersion=8.0'), { route: null, hadLaunchParams: true })
    assert.deepEqual(splitLaunchHash('#/content'), { route: '/content', hadLaunchParams: false })
    assert.deepEqual(splitLaunchHash('#%E0%A4%A'), { route: null, hadLaunchParams: false })
  })
})

/* ------------------------------------------------------ определение среды --- */

describe('определение среды и деградация', () => {
  it('Telegram.WebApp в обычном браузере (platform=unknown, пустой initData) — не Mini App', () => {
    assert.equal(isTelegramEnvironment(undefined), false)
    assert.equal(isTelegramEnvironment(null), false)
    assert.equal(isTelegramEnvironment({ initData: '', platform: 'unknown' }), false)
    assert.equal(isTelegramEnvironment({ initData: 'a=1', platform: 'unknown' }), true)
    assert.equal(isTelegramEnvironment({ initData: '', platform: 'tdesktop' }), true)
  })

  it('без SDK initMiniApp ничего не меняет и не бросает', () => {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/app/#/content')
    assert.equal(initMiniApp(undefined, { root: root as unknown as HTMLElement, win }), null)
    assert.equal(getMiniApp(), null)
    assert.equal(root.classes.size, 0)
    assert.equal(root.props.size, 0)
    markMiniAppReady() // вне Telegram — no-op
  })

  it('в обычном браузере SDK не загружается и адрес не трогается', async () => {
    const { win, replaced } = fakeWindow('https://site.test/app/#/content')
    assert.equal(shouldLoadSdk(win), false)
    g.window = win
    assert.equal(await bootstrapTelegramMiniApp(), null)
    assert.equal(replaced.length, 0)
  })

  it('после перезагрузки внутри Mini App признаком служит sessionStorage SDK', () => {
    const { win } = fakeWindow('https://site.test/app/#/content', { __telegram__initParams: '{}' })
    assert.equal(shouldLoadSdk(win), true)
  })

  it('недоступный SDK (ошибка сети) — промис разрешается null, без исключений', async () => {
    const appended: { src: string; onerror?: () => void }[] = []
    g.window = {}
    const doc = {
      createElement: () => ({}) as { src: string; onerror?: () => void },
      head: { appendChild: (el: { src: string; onerror?: () => void }) => void appended.push(el) },
    }
    const pending = loadTelegramSdk(1000, doc as unknown as Document)
    assert.equal(appended[0].src, TELEGRAM_SDK_URL)
    appended[0].onerror?.()
    assert.equal(await pending, null)
  })

  it('таймаут загрузки SDK тоже разрешается null', async () => {
    g.window = {}
    const doc = { createElement: () => ({}), head: { appendChild: () => {} } }
    assert.equal(await loadTelegramSdk(5, doc as unknown as Document), null)
  })

  it('старый клиент без isVersionAtLeast и методов не ломает инициализацию', () => {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/')
    const minimal: TelegramWebApp = { initData: 'a=1', platform: 'ios' }
    assert.equal(initMiniApp(minimal, { root: root as unknown as HTMLElement, win }), minimal)
    assert.equal(supports(minimal, '6.1'), false)
    markMiniAppReady()
    const release = requestClosingConfirmation()
    release()
  })

  it('исключение из метода SDK не прерывает инициализацию', () => {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/')
    const { webApp } = fakeWebApp({
      expand: () => {
        throw new Error('boom')
      },
      setHeaderColor: () => {
        throw new Error('WebAppHeaderColorInvalid')
      },
    })
    assert.equal(initMiniApp(webApp, { root: root as unknown as HTMLElement, win }), webApp)
    assert.ok(root.classes.has('tg-mini-app'))
  })
})

/* ------------------------------------------------------ инициализация --- */

describe('инициализация внутри Telegram', () => {
  it('expand, цвета, viewport, подписки; ready — один раз и после рендера', () => {
    const root = fakeRoot()
    const { win, listeners } = fakeWindow('https://site.test/')
    g.window = win
    const { webApp, calls, events } = fakeWebApp()
    initMiniApp(webApp, { root: root as unknown as HTMLElement, win })

    assert.ok(calls.includes('expand'))
    assert.ok(!calls.includes('ready'), 'ready вызывается мостом после первого рендера')
    assert.ok(calls.includes('header:#08090A'))
    assert.ok(calls.includes('bg:#08090A'))
    assert.ok(calls.includes('bottom:#0B0C0E'))
    assert.ok(root.classes.has('tg-mini-app'))
    for (const name of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'themeChanged']) {
      assert.ok(events.has(name), name)
    }
    assert.ok(listeners.includes('resize'))

    markMiniAppReady()
    markMiniAppReady()
    assert.equal(calls.filter((c) => c === 'ready').length, 1)
  })

  it('viewport: stable-высота, смещение свёрнутой части и safe area обновляются по событию', () => {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/')
    g.window = win
    const { webApp, events } = fakeWebApp()
    initMiniApp(webApp, { root: root as unknown as HTMLElement, win })
    assert.equal(root.props.get('--tg-app-viewport-stable-height'), '640px')
    assert.equal(root.props.get('--tg-app-bottom-offset'), '160px')
    assert.equal(root.props.get('--tg-app-inset-bottom'), '20px')
    assert.equal(root.props.get('--tg-app-inset-top'), '0px', 'вне fullscreen верхний системный отступ не нужен')

    webApp.viewportStableHeight = 800
    webApp.safeAreaInset = { top: 0, bottom: 34, left: 44, right: 44 }
    events.get('viewportChanged')!.forEach((h) => h())
    assert.equal(root.props.get('--tg-app-viewport-stable-height'), '800px')
    assert.equal(root.props.get('--tg-app-bottom-offset'), '0px')
    assert.equal(root.props.get('--tg-app-inset-bottom'), '34px')
    assert.equal(root.props.get('--tg-app-inset-left'), '44px')
  })

  it('до 6.9 hex-цвет шапки не отправляется (светлая шапка над тёмным сайтом)', () => {
    const root = fakeRoot()
    const { webApp, calls } = fakeWebApp({}, '6.2')
    applyColors(webApp, root as unknown as HTMLElement)
    assert.ok(!calls.some((c) => c.startsWith('header:')))
    assert.ok(calls.includes('bg:#08090A'))
    assert.ok(!calls.some((c) => c.startsWith('bottom:')))
  })

  it('applyViewport без размеров не падает', () => {
    const root = fakeRoot()
    applyViewport({ initData: 'a=1' }, root as unknown as HTMLElement)
    assert.equal(root.props.get('--tg-app-bottom-offset'), '0px')
  })
})

/* ------------------------------------------------ стартовый адрес --- */

describe('стартовый адрес Mini App', () => {
  it('известный startapp → маршрут; параметры Telegram убраны из hash', () => {
    const { webApp } = fakeWebApp({ initDataUnsafe: { start_param: 'fans' } })
    const { win, replaced } = fakeWindow('https://site.test/LadaGrantaCredit/#tgWebAppData=x&tgWebAppVersion=8.0')
    assert.equal(prepareStartLocation(webApp, win), '/fans')
    assert.deepEqual(replaced, ['/LadaGrantaCredit/#/fans'])
    assert.equal(peekPendingStartRoute(), '/fans')
    assert.equal(takePendingStartRoute(), '/fans')
    assert.equal(takePendingStartRoute(), null, 'deep link применяется один раз')
  })

  it('неизвестный startapp → обычный стартовый экран', () => {
    const { webApp } = fakeWebApp({ initDataUnsafe: { start_param: '../../admin' } })
    const { win, replaced } = fakeWindow('https://site.test/LadaGrantaCredit/#tgWebAppData=x')
    assert.equal(prepareStartLocation(webApp, win), null)
    assert.deepEqual(replaced, ['/LadaGrantaCredit/#/'])
    assert.equal(peekPendingStartRoute(), null)
  })

  it('кнопка бота ?screen=telegram открывает раздел «Бот» и убирает служебный параметр', () => {
    const { webApp } = fakeWebApp()
    const { win, replaced } = fakeWindow('https://site.test/LadaGrantaCredit/?screen=telegram&utm=bot#tgWebAppVersion=8.0')
    assert.equal(prepareStartLocation(webApp, win), '/settings')
    assert.deepEqual(replaced, ['/LadaGrantaCredit/?utm=bot#/settings'])
  })

  it('неизвестный ?screen= игнорируется', () => {
    const { webApp } = fakeWebApp()
    const { win, replaced } = fakeWindow('https://site.test/app/?screen=%2Fauth#tgWebAppVersion=8.0')
    assert.equal(prepareStartLocation(webApp, win), null)
    assert.deepEqual(replaced, ['/app/#/'])
  })

  it('перезагрузка внутри Mini App без параметров сохраняет текущий маршрут', () => {
    const { webApp } = fakeWebApp()
    const { win, replaced } = fakeWindow('https://site.test/app/#/content')
    assert.equal(prepareStartLocation(webApp, win), '/content')
    assert.equal(replaced.length, 0)
  })
})

/* --------------------------------------------------------- BackButton --- */

describe('BackButton и навигация', () => {
  it('на корне и экране входа кнопка скрыта и ничего не закрывает', () => {
    assert.deepEqual(backButtonPlan({ pathname: '/', historyIndex: 3, pendingHandlers: 0 }), { visible: false, action: 'none' })
    assert.deepEqual(backButtonPlan({ pathname: '/auth', historyIndex: 0, pendingHandlers: 0 }), { visible: false, action: 'none' })
  })

  it('с внутренней историей — назад по истории, без неё — к родителю', () => {
    assert.deepEqual(backButtonPlan({ pathname: '/content', historyIndex: 2, pendingHandlers: 0 }), { visible: true, action: 'history' })
    assert.deepEqual(backButtonPlan({ pathname: '/fans', historyIndex: 0, pendingHandlers: 0 }), { visible: true, action: 'parent' })
    assert.equal(parentRoute('/fans'), '/')
    assert.equal(parentRoute('/content/schedule'), '/content')
    assert.equal(parentRoute('/'), '/')
  })

  it('открытое окно перехватывает «Назад» даже на корне; обработчики снимаются', () => {
    const closed: string[] = []
    const releaseA = pushBackHandler(() => closed.push('a'))
    const releaseB = pushBackHandler(() => closed.push('b'))
    assert.deepEqual(backButtonPlan({ pathname: '/', historyIndex: 0, pendingHandlers: 2 }), { visible: true, action: 'handler' })
    assert.equal(runTopBackHandler(), true)
    assert.deepEqual(closed, ['b'])
    releaseB()
    runTopBackHandler()
    assert.deepEqual(closed, ['b', 'a'])
    releaseA()
    assert.equal(runTopBackHandler(), false)
  })
})

describe('подтверждение закрытия', () => {
  it('включается только пока есть несохранённые изменения', () => {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/')
    g.window = win
    const { webApp, calls } = fakeWebApp()
    initMiniApp(webApp, { root: root as unknown as HTMLElement, win })
    assert.ok(!calls.includes('confirm:on'), 'глобально не включается')
    const a = requestClosingConfirmation()
    const b = requestClosingConfirmation()
    assert.equal(calls.filter((c) => c === 'confirm:on').length, 1)
    a()
    a()
    assert.ok(!calls.includes('confirm:off'))
    b()
    assert.equal(calls.filter((c) => c === 'confirm:off').length, 1)
  })

  it('вне Telegram — no-op', () => {
    const release = requestClosingConfirmation()
    release()
  })
})

describe('диалоги, ссылки, свайпы и файлы внутри Mini App', () => {
  function started(overrides: Partial<TelegramWebApp> = {}, version = '8.0') {
    const root = fakeRoot()
    const { win } = fakeWindow('https://site.test/')
    g.window = win
    const fake = fakeWebApp(overrides, version)
    initMiniApp(fake.webApp, { root: root as unknown as HTMLElement, win })
    return fake
  }

  it('confirmAction использует нативный попап Telegram и обрезает длинный текст', async () => {
    const { calls } = started()
    assert.equal(await confirmAction('Выйти из аккаунта?'), true)
    assert.ok(calls.includes('popup:Выйти из аккаунта?'))
    await confirmAction('x'.repeat(400))
    const long = calls.find((c) => c.startsWith('popup:x'))!
    assert.equal(long.length - 'popup:'.length, 256)
  })

  it('confirmAction вне Telegram — window.confirm', async () => {
    g.window = { confirm: (m: string) => m === 'да?' }
    assert.equal(await confirmAction('да?'), true)
    assert.equal(await confirmAction('нет?'), false)
  })

  it('confirmAction на клиенте < 6.2 не вызывает попап', async () => {
    const { calls } = started({}, '6.1')
    ;(g.window as Record<string, unknown>).confirm = () => true
    assert.equal(await confirmAction('ok?'), true)
    assert.ok(!calls.some((c) => c.startsWith('popup:')))
  })

  it('classifyLink различает t.me, внешние, свои и прочие ссылки', () => {
    const origin = 'https://andrey1904-dev.github.io'
    assert.equal(classifyLink('https://t.me/LadaGarage_bot?start=site', origin), 'telegram')
    assert.equal(classifyLink('https://mail.yandex.ru/', origin), 'external')
    assert.equal(classifyLink('/LadaGrantaCredit/#/fans', origin), 'internal')
    assert.equal(classifyLink('mailto:owner@example.com', origin), 'other')
    assert.equal(classifyLink('javascript:alert(1)', origin), 'other')
  })

  it('openLinkInTelegram: t.me — openTelegramLink, внешние — openLink, свои — штатно', () => {
    const { calls } = started()
    const origin = 'https://site.test'
    assert.equal(openLinkInTelegram('https://t.me/LadaGarage_bot', origin), true)
    assert.equal(openLinkInTelegram('https://gosuslugi.ru/', origin), true)
    assert.equal(openLinkInTelegram('https://site.test/#/content', origin), false)
    assert.ok(calls.includes('tglink:https://t.me/LadaGarage_bot'))
    assert.ok(calls.includes('link:https://gosuslugi.ru/'))
  })

  it('openLinkInTelegram вне Telegram ничего не перехватывает', () => {
    assert.equal(openLinkInTelegram('https://t.me/x', 'https://site.test'), false)
  })

  it('lockVerticalSwipes: счётчик блокировок, только с 7.7', () => {
    const { calls } = started()
    const a = lockVerticalSwipes()
    const b = lockVerticalSwipes()
    assert.equal(calls.filter((c) => c === 'swipes:off').length, 1)
    a()
    assert.ok(!calls.includes('swipes:on'))
    b()
    assert.equal(calls.filter((c) => c === 'swipes:on').length, 1)

    __resetMiniAppForTests()
    const old = started({}, '7.6')
    lockVerticalSwipes()()
    assert.ok(!old.calls.some((c) => c.startsWith('swipes:')))
  })

  it('альтернатива скачиванию нужна только в мобильных клиентах', () => {
    assert.equal(needsFileFallback(), false)
    started({ platform: 'ios' })
    assert.equal(needsFileFallback(), true)
    __resetMiniAppForTests()
    started({ platform: 'tdesktop' })
    assert.equal(needsFileFallback(), false)
  })
})
