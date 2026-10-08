/**
 * E2E-тест Telegram Mini App в настоящем Chromium на production-сборке (dist/).
 *
 * Клиент Telegram эмулируется так же, как его видит сайт:
 *   • параметры запуска — в hash (`#tgWebAppData=…&tgWebAppVersion=…`);
 *   • запрос к https://telegram.org/js/telegram-web-app.js отдаёт официальный код SDK
 *     (копия из пакета @twa-dev/sdk; с E2E_REAL_SDK=1 — настоящий файл из сети);
 *   • исходящие события SDK ловит `window.TelegramWebviewProxy` (как в мобильных
 *     клиентах), входящие — `Telegram.WebView.receiveEvent(...)`.
 * Все прочие внешние запросы (шрифты и т.п.) блокируются: тест не зависит от сети.
 *
 * Запуск:  npm run build && npm run e2e
 * Браузер: CHROME_PATH=/path/to/chrome, иначе установленный Google Chrome
 *          (channel "chrome", есть на раннерах GitHub Actions).
 * Если браузер не найден — тест пропускается; с E2E_REQUIRED=1 это ошибка.
 * Скриншоты: node_modules/.tmp/e2e/*.png
 */
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dist = path.join(root, 'dist')
const shots = path.join(root, 'node_modules', '.tmp', 'e2e')
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'))
const BASE_PATH = site.basePath
const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
const required = process.env.E2E_REQUIRED === '1'

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html не найден: сначала npm run build.')
  process.exit(1)
}
fs.mkdirSync(shots, { recursive: true })

// Пакет не экспортирует этот файл через "exports" — берём его из node_modules напрямую.
// Если пакет не установлен (npm ci не выполнялся), тест говорит об этом прямо, а не падает на чтении файла.
const sdkFile = path.join(root, 'node_modules', '@twa-dev', 'sdk', 'dist', 'telegram-web-apps.js')
if (!fs.existsSync(sdkFile)) {
  console.error(`E2E: не найден ${path.relative(root, sdkFile)}. Выполните npm ci.`)
  process.exit(1)
}
const sdkSource = fs.readFileSync(sdkFile, 'utf8')

/* ----------------------------------------------------- статический сервер --- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json',
}
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith(BASE_PATH)) {
    res.writeHead(404).end()
    return
  }
  let file = path.join(dist, decodeURIComponent(url.pathname.slice(BASE_PATH.length)))
  if (!file.startsWith(dist)) {
    res.writeHead(403).end()
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const SITE = `${origin}${BASE_PATH}`

/* ------------------------------------------------------------- браузер --- */

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  const attempts = []
  if (process.env.CHROME_PATH) attempts.push({ executablePath: process.env.CHROME_PATH, args })
  attempts.push({ channel: 'chrome', args })
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(candidate)) attempts.push({ executablePath: candidate, args })
  }
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options })
    } catch (error) {
      if (process.env.E2E_DEBUG) console.warn(String(error).split('\n')[0])
    }
  }
  return null
}

const browser = await launchBrowser()
if (!browser) {
  server.close()
  const message = 'Chromium/Chrome не найден (задайте CHROME_PATH).'
  if (required) {
    console.error(`E2E: ${message}`)
    process.exit(1)
  }
  console.log(`E2E пропущен: ${message}`)
  process.exit(0)
}

/* -------------------------------------------------------------- помощники --- */

let failed = 0
let passed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (ok) passed++
  else failed++
}

function launchUrl({ version = '8.0', platform = 'android', startParam = '', query = '', hashRoute = '' } = {}) {
  const user = JSON.stringify({ id: 1, first_name: 'Тест' })
  const initData = new URLSearchParams({ query_id: 'AAE2E', user, auth_date: String(Math.floor(Date.now() / 1000)) })
  if (startParam) initData.set('start_param', startParam)
  initData.set('hash', '0'.repeat(64))
  const params = new URLSearchParams({
    tgWebAppData: initData.toString(),
    tgWebAppVersion: version,
    tgWebAppPlatform: platform,
    tgWebAppThemeParams: JSON.stringify({ bg_color: '#ffffff', text_color: '#000000', secondary_bg_color: '#f0f0f0' }),
  })
  return `${SITE}${query}#${hashRoute ? `${hashRoute}?` : ''}${params.toString()}`
}

/**
 * Новая вкладка «клиента Telegram». sdk: 'serve' | 'fail' | 'none'.
 */
async function openPage({ width = 390, height = 800, sdk = 'serve' } = {}) {
  // Свой браузер на каждую «вкладку»: так сценарии не влияют друг на друга
  // (и не зависят от того, переживает ли браузер закрытие контекстов).
  const pageBrowser = await launchBrowser()
  const context = await pageBrowser.newContext({ viewport: { width, height }, locale: 'ru-RU', deviceScaleFactor: 1 })
  const closeContext = context.close.bind(context)
  context.close = async () => {
    await closeContext().catch(() => {})
    await pageBrowser.close().catch(() => {})
  }
  const page = await context.newPage()
  // Ограничиваем ожидания: зависший шаг должен упасть с понятной ошибкой, а не висеть.
  page.setDefaultTimeout(15_000)
  const errors = []
  const sdkRequests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => {
    errors.push(`native dialog in Mini App: ${dialog.message()}`)
    void dialog.dismiss()
  })
  await page.addInitScript(() => {
    window.__tgEvents = []
    window.TelegramWebviewProxy = {
      postEvent(type, data) {
        window.__tgEvents.push([type, data ? JSON.parse(data) : null])
      },
    }
  })
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith(origin)) return route.continue()
    if (url.startsWith(SDK_URL)) {
      sdkRequests.push(url)
      if (sdk === 'fail') return route.abort('connectionrefused')
      if (process.env.E2E_REAL_SDK === '1') return route.continue()
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: sdkSource })
    }
    return route.abort('blockedbyclient')
  })
  return { context, page, errors, sdkRequests }
}

const events = (page) => page.evaluate(() => window.__tgEvents.slice())
const lastEvent = async (page, type) => (await events(page)).filter(([t]) => t === type).at(-1)?.[1] ?? null
const hash = (page) => page.evaluate(() => window.location.hash)
const receive = (page, type, data) =>
  page.evaluate(([t, d]) => window.Telegram.WebView.receiveEvent(t, d), [type, data ?? null])
const waitHash = (page, value, timeout = 5000) =>
  page.waitForFunction((v) => window.location.hash === v, value, { timeout }).then(() => true, () => false)

async function enterDemo(page) {
  await page.getByRole('button', { name: /Explore demo mode/ }).click()
  await waitHash(page, '#/')
}

/** Переход по разделу меню: на узком экране сначала открывается боковая панель. */
async function nav(page, label) {
  const opener = page.getByRole('button', { name: 'Open navigation' })
  if (await opener.isVisible().catch(() => false)) await opener.click()
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: label, exact: true }).first().click()
}

/** Отвечает на последний попап Telegram (web_app_open_popup). */
async function answerPopup(page, ok) {
  await page.waitForFunction(() => window.__tgEvents.some(([t]) => t === 'web_app_open_popup'), null, { timeout: 3000 })
  const popup = await lastEvent(page, 'web_app_open_popup')
  await receive(page, 'popup_closed', { button_id: ok ? 'ok' : '' })
  return popup
}

/** Ждёт, пока последнее состояние BackButton станет нужным (эффекты React асинхронны). */
const waitBackButton = (page, visible, timeout = 3000) =>
  page
    .waitForFunction(
      (v) => window.__tgEvents.filter(([t]) => t === 'web_app_setup_back_button').at(-1)?.[1]?.is_visible === v,
      visible,
      { timeout },
    )
    .then(() => true, () => false)

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

/* ============================================================ сценарии === */

/** E2E_ONLY=1,3 — прогнать только указанные сценарии (для отладки). */
const onlyScenarios = process.env.E2E_ONLY ? new Set(process.env.E2E_ONLY.split(',').map((x) => x.trim())) : null
const run = (scenario) => !onlyScenarios || onlyScenarios.has(scenario)

const ROUTES_TO_CHECK = ['/', '/fans', '/conversations', '/content', '/ai', '/settings']
const cssVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

// 1. Обычный браузер: SDK не грузится, интеграция не активна (десктопная ширина: меню видно сразу).
if (run('1')) {
  const { context, page, errors, sdkRequests } = await openPage({ width: 1280, height: 860 })
  await page.goto(SITE)
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  check('браузер: экран входа отрисован', true)
  check('браузер: запроса к telegram.org нет', sdkRequests.length === 0, sdkRequests.join(', '))
  check('браузер: класс tg-mini-app не ставится', !(await page.evaluate(() => document.documentElement.classList.contains('tg-mini-app'))))
  check('браузер: <html lang="en">', (await page.getAttribute('html', 'lang')) === 'en')
  await enterDemo(page)
  await nav(page, 'Conversations')
  check('браузер: навигация работает', await waitHash(page, '#/conversations'), await hash(page))
  check('браузер: без ошибок JS', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: path.join(shots, '01-browser.png') })
  await context.close()
}

// 2. Запуск из Telegram, но SDK недоступен — сайт всё равно открывается.
if (run('2')) {
  const { context, page, errors } = await openPage({ sdk: 'fail' })
  const started = Date.now()
  await page.goto(launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const elapsed = Date.now() - started
  check('SDK недоступен: сайт отрисован', true)
  check('SDK недоступен: отрисовка ≤ 5 с', elapsed <= 5000, `${elapsed} мс`)
  check('SDK недоступен: интеграция выключена', !(await page.evaluate(() => document.documentElement.classList.contains('tg-mini-app'))))
  check('SDK недоступен: параметры запуска убраны из адреса', !(await hash(page)).includes('tgWebApp'), await hash(page))
  check('SDK недоступен: без ошибок JS', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 3. Основной сценарий Mini App (Android, Bot API 8.0).
if (run('3')) {
  const { context, page, errors } = await openPage({ width: 390, height: 800 })
  await page.goto(launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const list = (await events(page)).map(([t]) => t)
  check('Mini App: expand()', list.includes('web_app_expand'))
  check('Mini App: ready()', list.includes('web_app_ready'))
  check('Mini App: expand до ready', list.indexOf('web_app_expand') < list.lastIndexOf('web_app_ready'))
  const header = (await lastEvent(page, 'web_app_set_header_color'))?.color ?? ''
  check('Mini App: шапка — фирменный цвет сайта', header.toLowerCase() === '#08090a', header)
  check('Mini App: initData убран из адреса', !(await hash(page)).includes('tgWebApp'), await hash(page))
  check('Mini App: неавторизованный — штатный экран входа', (await hash(page)) === '#/auth', await hash(page))
  check('Mini App: на экране входа BackButton скрыт', (await lastEvent(page, 'web_app_setup_back_button'))?.is_visible !== true)
  await page.screenshot({ path: path.join(shots, '03-auth.png') })

  await enterDemo(page)
  check('Mini App: вход в демо → главная', (await hash(page)) === '#/')
  check('Mini App: на главной BackButton скрыт', await waitBackButton(page, false))

  // Внутренний экран: BackButton показан и возвращает на родительский маршрут.
  await page.evaluate(() => (window.location.hash = '#/conversations'))
  await waitHash(page, '#/conversations')
  check('BackButton: показан на внутреннем экране', await waitBackButton(page, true))
  // Без внутренней истории «Назад» ведёт на родительский раздел (parentRoute), а не на «предыдущий» в браузере.
  await receive(page, 'back_button_pressed')
  check('BackButton: назад — на родительский раздел (главную)', await waitHash(page, '#/'), await hash(page))
  check('BackButton: на главной скрыт', await waitBackButton(page, false))
  await receive(page, 'back_button_pressed')
  await page.waitForTimeout(200)
  const closed = (await events(page)).some(([t]) => t === 'web_app_close')
  check('BackButton: на корне Mini App не закрывается и адрес не меняется', !closed && (await hash(page)) === '#/')

  // viewport и safe area: переменные сайта повторяют данные клиента Telegram.
  await receive(page, 'viewport_changed', { height: 520, is_state_stable: true, is_expanded: false })
  await page.waitForTimeout(100)
  check('viewport: стабильная высота 520 px применена', (await cssVar(page, '--tg-app-viewport-stable-height')) === '520px', await cssVar(page, '--tg-app-viewport-stable-height'))
  await receive(page, 'safe_area_changed', { top: 0, bottom: 34, left: 0, right: 0 })
  await page.waitForTimeout(100)
  check('safe area: нижний отступ 34 px', (await cssVar(page, '--tg-app-inset-bottom')) === '34px', await cssVar(page, '--tg-app-inset-bottom'))
  await page.screenshot({ path: path.join(shots, '03-dashboard.png') })

  // Ссылки: t.me — внутри Telegram, внешние — во внешнем браузере.
  await page.evaluate(() => {
    for (const href of ['https://t.me/mara_os_bot?start=site', 'https://example.com/docs']) {
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.textContent = href
      a.id = href.includes('t.me') ? 'e2e-tg' : 'e2e-ext'
      a.style.cssText = `position:fixed;left:8px;top:${a.id === 'e2e-tg' ? 120 : 160}px;z-index:9999;background:#fff;color:#000`
      document.body.appendChild(a)
    }
  })
  await page.locator('#e2e-tg').click()
  await page.locator('#e2e-ext').click()
  check('ссылки: t.me → openTelegramLink', (await lastEvent(page, 'web_app_open_tg_link'))?.path_full === '/mara_os_bot?start=site')
  check('ссылки: внешняя → openLink', (await lastEvent(page, 'web_app_open_link'))?.url === 'https://example.com/docs')
  check('ссылки: новые вкладки внутри WebView не открываются', context.pages().length === 1, String(context.pages().length))

  // Экспорт на мобильном клиенте: файл не скачивается Blob-ом — предлагается браузер.
  await page.evaluate(() => (window.location.hash = '#/fans'))
  await waitHash(page, '#/fans')
  // Экспорт пуст, пока данные не загрузились: ждём счётчик фанов в заголовке.
  await page.getByText(/[1-9]\d* fans in the all view/).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: /Export CSV/ }).click()
  const exportPopup = await answerPopup(page, true)
  check('экспорт: предложено открыть кабинет в браузере', /browser/i.test(exportPopup?.message ?? ''), JSON.stringify(exportPopup))
  check('экспорт: открывается внешний браузер на разделе «Fans»', /#\/fans$/.test((await lastEvent(page, 'web_app_open_link'))?.url ?? ''))

  check('Mini App: без ошибок JS и нативных диалогов', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 4. Deep links: startapp и ?screen= открываются после штатного входа.
if (run('4')) for (const [name, opts, expected] of [
  ['startapp=fans', { startParam: 'fans' }, '#/fans'],
  ['startapp=ai', { startParam: 'ai' }, '#/ai'],
  ['неизвестный startapp', { startParam: 'admin' }, '#/'],
  ['опасный startapp', { startParam: '..%2Fauth' }, '#/'],
  ['кнопка бота ?screen=telegram', { query: '?screen=telegram' }, '#/settings'],
  ['неизвестный ?screen=', { query: '?screen=%2F%2Fevil.example' }, '#/'],
]) {
  const { context, page, errors } = await openPage()
  await page.goto(launchUrl(opts))
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  check(`deep link ${name}: сначала штатный вход`, (await hash(page)) === '#/auth', await hash(page))
  await page.getByRole('button', { name: /Explore demo mode/ }).click()
  const ok = await waitHash(page, expected)
  await page.waitForTimeout(300)
  check(`deep link ${name}: после входа ${expected}`, ok && (await hash(page)) === expected, await hash(page))
  check(`deep link ${name}: служебный ?screen= убран`, !page.url().includes('screen='), page.url())
  check(`deep link ${name}: без ошибок`, errors.length === 0, errors.join(' | '))
  await context.close()
}

// 5. Старый клиент (Bot API 6.0): без BackButton и hex-цвета шапки, но без падений.
if (run('5')) {
  const { context, page, errors } = await openPage()
  await page.goto(launchUrl({ version: '6.0', platform: 'tdesktop' }))
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  await enterDemo(page)
  await page.evaluate(() => (window.location.hash = '#/fans'))
  await waitHash(page, '#/fans')
  const all = await events(page)
  const list = all.map(([t]) => t)
  check('Bot API 6.0: ready и expand', list.includes('web_app_ready') && list.includes('web_app_expand'))
  const hexHeader = all.some(([t, d]) => t === 'web_app_set_header_color' && d?.color)
  check('Bot API 6.0: неподдерживаемые методы не вызываются', !hexHeader && !list.includes('web_app_setup_back_button'), JSON.stringify(all))
  check('Bot API 6.0: без ошибок', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 6. Ширина 320 px: нет горизонтальной прокрутки ни в браузере, ни в Mini App.
if (run('6')) for (const mode of ['browser', 'mini-app']) {
  const { context, page, errors } = await openPage({ width: 320, height: 640 })
  await page.goto(mode === 'browser' ? SITE : launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const overflow = []
  if (!(await noHorizontalScroll(page))) overflow.push('/auth')
  await enterDemo(page)
  for (const route of ROUTES_TO_CHECK) {
    await page.evaluate((r) => (window.location.hash = `#${r}`), route)
    await page.waitForTimeout(350)
    if (!(await noHorizontalScroll(page))) {
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      overflow.push(`${route} (${width}px)`)
    }
  }
  await page.screenshot({ path: path.join(shots, `06-${mode}-320.png`), fullPage: false })
  check(`320 px (${mode}): нет горизонтальной прокрутки`, overflow.length === 0, overflow.join(', '))
  check(`320 px (${mode}): без ошибок`, errors.length === 0, errors.join(' | '))
  await context.close()
}

// 7. Шапка на планшетах и десктопе: кнопка меню пользователя видна.
if (run('7')) {
  const { context, page, errors } = await openPage({ width: 768, height: 900 })
  await page.goto(SITE)
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  await enterDemo(page)
  const clipped = []
  for (const width of [768, 900, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => {
      const row = document.querySelector('header > div')
      const avatar = document.querySelector('header img[alt="Mara Quinn"]')?.getBoundingClientRect()
      return { overflow: row.scrollWidth > row.clientWidth + 1, right: avatar?.right ?? 0, vw: window.innerWidth }
    })
    if (r.overflow || r.right > r.vw) clipped.push(`${width}px`)
  }
  check('шапка 768–1440 px: содержимое помещается, меню пользователя видно', clipped.length === 0, clipped.join(', '))
  check('шапка: без ошибок', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 8. Поворот экрана (альбомная ориентация телефона) в Mini App.
if (run('8')) {
  const { context, page, errors } = await openPage({ width: 390, height: 800 })
  await page.goto(launchUrl({ platform: 'ios' }))
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  await enterDemo(page)
  await page.setViewportSize({ width: 800, height: 390 })
  await receive(page, 'viewport_changed', { height: 390, is_state_stable: true, is_expanded: true })
  await receive(page, 'safe_area_changed', { top: 0, bottom: 21, left: 47, right: 47 })
  await page.waitForTimeout(200)
  check('поворот: стабильная высота 390 px', (await cssVar(page, '--tg-app-viewport-stable-height')) === '390px')
  check('поворот: боковые safe area учтены', (await cssVar(page, '--tg-app-inset-left')) === '47px', await cssVar(page, '--tg-app-inset-left'))
  check('поворот: нет горизонтальной прокрутки', await noHorizontalScroll(page))
  check('поворот: без ошибок', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: path.join(shots, '07-landscape.png') })
  await context.close()
}

await browser.close()
server.close()
console.log(failed === 0 ? `\nE2E Mini App: все ${passed} проверок пройдены.` : `\nE2E Mini App: провалено ${failed} из ${passed + failed}.`)
process.exit(failed === 0 ? 0 : 1)
