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
const BASE_PATH = '/LadaGrantaCredit/'
const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
const required = process.env.E2E_REQUIRED === '1'

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html не найден: сначала npm run build.')
  process.exit(1)
}
fs.mkdirSync(shots, { recursive: true })

// Пакет не экспортирует этот файл через "exports" — берём его из node_modules напрямую.
const sdkDir = path.join(root, 'node_modules', '@twa-dev', 'sdk')
const sdkSource = fs.readFileSync(path.join(sdkDir, 'dist', 'telegram-web-apps.js'), 'utf8')

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
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ru-RU', deviceScaleFactor: 1 })
  const page = await context.newPage()
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

async function nav(page, label) {
  await page.locator('nav[aria-label="Primary navigation"]').getByText(label, { exact: true }).click()
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

// 1. Обычный браузер: SDK не грузится, интеграция не активна.
{
  const { context, page, errors, sdkRequests } = await openPage()
  await page.goto(SITE)
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  check('браузер: экран входа отрисован', true)
  check('браузер: запроса к telegram.org нет', sdkRequests.length === 0, sdkRequests.join(', '))
  check('браузер: класс tg-mini-app не ставится', !(await page.evaluate(() => document.documentElement.classList.contains('tg-mini-app'))))
  await enterDemo(page)
  await nav(page, 'Кредит')
  check('браузер: навигация работает как раньше', await waitHash(page, '#/credit'))
  check('браузер: без ошибок JS', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: path.join(shots, '01-browser.png') })
  await context.close()
}

// 2. Запуск из Telegram, но SDK недоступен — сайт всё равно открывается.
{
  const { context, page, errors } = await openPage({ sdk: 'fail' })
  const started = Date.now()
  await page.goto(launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const elapsed = Date.now() - started
  check('SDK недоступен: сайт отрисован', true)
  check('SDK недоступен: отрисовка ≤ 5 с', elapsed <= 5000, `${elapsed} мс`)
  check('SDK недоступен: интеграция выключена', !(await page.evaluate(() => document.documentElement.classList.contains('tg-mini-app'))))
  check('SDK недоступен: параметры запуска убраны роутером', !(await hash(page)).includes('tgWebApp'), await hash(page))
  check('SDK недоступен: без ошибок JS', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 3. Основной сценарий Mini App (Android, Bot API 8.0).
{
  const { context, page, errors } = await openPage({ width: 390, height: 800 })
  await page.goto(launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const list = (await events(page)).map(([t]) => t)
  check('Mini App: expand()', list.includes('web_app_expand'))
  check('Mini App: ready()', list.includes('web_app_ready'))
  check('Mini App: expand до ready', list.indexOf('web_app_expand') < list.lastIndexOf('web_app_ready'))
  check('Mini App: шапка #08090a', (await lastEvent(page, 'web_app_set_header_color'))?.color === '#08090a')
  check('Mini App: фон #08090a', (await lastEvent(page, 'web_app_set_background_color'))?.color === '#08090a')
  check('Mini App: нижняя панель #0b0c0e', (await lastEvent(page, 'web_app_set_bottom_bar_color'))?.color === '#0b0c0e')
  check('Mini App: initData убран из адреса', !(await hash(page)).includes('tgWebApp'), await hash(page))
  check('Mini App: неавторизованный — штатный экран входа', (await hash(page)) === '#/auth')
  check('Mini App: на экране входа BackButton скрыт', (await lastEvent(page, 'web_app_setup_back_button'))?.is_visible !== true)
  await page.screenshot({ path: path.join(shots, '03-auth.png') })

  await enterDemo(page)
  check('Mini App: вход в демо → главная', (await hash(page)) === '#/')
  await nav(page, 'Кредит')
  await waitHash(page, '#/credit')
  check('BackButton: показан на внутреннем экране', await waitBackButton(page, true))
  await nav(page, 'Расходы')
  await waitHash(page, '#/expenses')
  await receive(page, 'back_button_pressed')
  check('BackButton: назад к предыдущему экрану', await waitHash(page, '#/credit'), await hash(page))
  await receive(page, 'back_button_pressed')
  check('BackButton: назад на главную', await waitHash(page, '#/'), await hash(page))
  check('BackButton: на главной скрыт', await waitBackButton(page, false))
  await receive(page, 'back_button_pressed')
  await page.waitForTimeout(200)
  const closed = (await events(page)).some(([t]) => t === 'web_app_close')
  check('BackButton: на корне Mini App не закрывается и адрес не меняется', !closed && (await hash(page)) === '#/')

  // viewport: Mini App частично свёрнут — нижняя панель остаётся в видимой области
  const navBox = () => page.locator('nav[aria-label="Основная навигация"]').boundingBox()
  await receive(page, 'viewport_changed', { height: 520, is_state_stable: true, is_expanded: false })
  await page.waitForTimeout(100)
  const collapsed = await navBox()
  check('viewport: панель поднята над скрытой частью WebView', Math.abs(collapsed.y + collapsed.height - 520) <= 2, JSON.stringify(collapsed))
  await receive(page, 'viewport_changed', { height: 800, is_state_stable: true, is_expanded: true })
  await page.waitForTimeout(100)
  const expanded = await navBox()
  check('viewport: после раскрытия панель у нижнего края', Math.abs(expanded.y + expanded.height - 800) <= 2, JSON.stringify(expanded))

  await receive(page, 'safe_area_changed', { top: 0, bottom: 34, left: 0, right: 0 })
  await page.waitForTimeout(100)
  const pad = await page.locator('nav[aria-label="Основная навигация"]').evaluate((el) => getComputedStyle(el).paddingBottom)
  check('safe area: отступ панели от home indicator', pad === '34px', pad)
  await page.screenshot({ path: path.join(shots, '03-dashboard.png') })

  // Окно с формой: «Назад» закрывает окно, с несохранёнными данными — спрашивает
  await nav(page, 'Расходы')
  await waitHash(page, '#/expenses')
  await page.getByRole('button', { name: /Добавить расход/ }).first().click()
  await page.getByRole('dialog').waitFor()
  check('окно: свайп вниз не сворачивает Mini App', (await lastEvent(page, 'web_app_setup_swipe_behavior'))?.allow_vertical_swipe === false)
  check('окно: BackButton виден', await waitBackButton(page, true))
  await page.getByRole('dialog').getByLabel(/Сумма/).fill('1500')
  await page.waitForTimeout(100)
  check('окно: подтверждение закрытия Mini App при несохранённой форме', (await lastEvent(page, 'web_app_setup_closing_behavior'))?.need_confirmation === true)
  await page.screenshot({ path: path.join(shots, '03-sheet.png') })
  await receive(page, 'back_button_pressed')
  const discard = await answerPopup(page, false)
  check('окно: «Назад» с данными спрашивает подтверждение', /без сохранения/.test(discard?.message ?? ''), JSON.stringify(discard))
  await page.waitForTimeout(100)
  check('окно: отмена — форма остаётся открытой', await page.getByRole('dialog').isVisible())
  await receive(page, 'back_button_pressed')
  await answerPopup(page, true)
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  check('окно: подтверждение — окно закрыто, страница та же', (await page.getByRole('dialog').count()) === 0 && (await hash(page)) === '#/expenses')
  check('окно: подтверждение закрытия снято', (await lastEvent(page, 'web_app_setup_closing_behavior'))?.need_confirmation === false)
  check('окно: свайпы снова разрешены', (await lastEvent(page, 'web_app_setup_swipe_behavior'))?.allow_vertical_swipe === true)

  // Ссылки: t.me — внутри Telegram, внешние — во внешнем браузере
  await page.evaluate(() => {
    for (const href of ['https://t.me/LadaGarage_bot?start=site', 'https://example.com/docs']) {
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
  check('ссылки: t.me → openTelegramLink', (await lastEvent(page, 'web_app_open_tg_link'))?.path_full === '/LadaGarage_bot?start=site')
  check('ссылки: внешняя → openLink', (await lastEvent(page, 'web_app_open_link'))?.url === 'https://example.com/docs')
  check('ссылки: новые вкладки внутри WebView не открываются', context.pages().length === 1, String(context.pages().length))

  // Экспорт на мобильном клиенте: Blob-скачивание заменено
  await nav(page, 'Гараж')
  await waitHash(page, '#/garage')
  await page.getByRole('button', { name: /Резервная копия/ }).click()
  const exportPopup = await answerPopup(page, true)
  check('экспорт: предложено открыть кабинет в браузере', /браузере/.test(exportPopup?.message ?? ''), JSON.stringify(exportPopup))
  check('экспорт: открывается внешний браузер на разделе «Гараж»', /#\/garage$/.test((await lastEvent(page, 'web_app_open_link'))?.url ?? ''))

  // Выход: подтверждение нативным попапом Telegram (window.confirm не используется)
  await page.getByRole('button', { name: /Выйти из демо-режима/ }).click()
  await answerPopup(page, false)
  await page.waitForTimeout(150)
  check('выход: отмена в попапе — остаёмся в кабинете', (await hash(page)) === '#/garage')
  await page.getByRole('button', { name: /Выйти из демо-режима/ }).click()
  await answerPopup(page, true)
  check('выход: подтверждение — экран входа', await waitHash(page, '#/auth'))

  // Перезагрузка внутри Mini App: SDK восстанавливает параметры из sessionStorage
  await enterDemo(page)
  await nav(page, 'Кредит')
  await waitHash(page, '#/credit')
  await page.reload()
  await page.waitForFunction(() => document.documentElement.classList.contains('tg-mini-app'), null, { timeout: 8000 }).catch(() => {})
  check('перезагрузка: остаёмся Mini App', await page.evaluate(() => document.documentElement.classList.contains('tg-mini-app')))
  check('перезагрузка: текущий раздел сохранён', (await hash(page)) === '#/credit', await hash(page))

  check('Mini App: без ошибок JS и нативных диалогов', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 4. Deep links: startapp и ?screen= открываются после штатного входа.
for (const [name, opts, expected] of [
  ['startapp=garage', { startParam: 'garage' }, '#/garage'],
  ['startapp=expenses', { startParam: 'expenses' }, '#/expenses'],
  ['неизвестный startapp', { startParam: 'admin' }, '#/'],
  ['опасный startapp', { startParam: '..%2Fauth' }, '#/'],
  ['кнопка бота ?screen=telegram', { query: '?screen=telegram' }, '#/telegram'],
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

// 5. Старый клиент (Bot API 6.0): без BackButton/цветов, но без падений.
{
  const { context, page, errors } = await openPage()
  await page.goto(launchUrl({ version: '6.0', platform: 'tdesktop' }))
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  await enterDemo(page)
  await nav(page, 'Кредит')
  await waitHash(page, '#/credit')
  const all = await events(page)
  const list = all.map(([t]) => t)
  check('Bot API 6.0: ready и expand', list.includes('web_app_ready') && list.includes('web_app_expand'))
  // SDK сам сообщает клиенту color_key темы; сайт не должен слать hex-цвет шапки и BackButton.
  const hexHeader = all.some(([t, d]) => t === 'web_app_set_header_color' && d?.color)
  check('Bot API 6.0: неподдерживаемые методы не вызываются', !hexHeader && !list.includes('web_app_setup_back_button'), JSON.stringify(all))
  check('Bot API 6.0: без ошибок', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 6. Ширина 320 px: нет горизонтальной прокрутки ни в браузере, ни в Mini App.
for (const mode of ['browser', 'mini-app']) {
  const { context, page, errors } = await openPage({ width: 320, height: 640 })
  await page.goto(mode === 'browser' ? SITE : launchUrl())
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  const overflow = []
  if (!(await noHorizontalScroll(page))) overflow.push('/auth')
  await enterDemo(page)
  for (const route of ['/', '/credit', '/expenses', '/service', '/garage', '/telegram']) {
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

// 6b. Шапка на планшетах и десктопе: кнопка выхода не уезжает за край.
{
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
      const btn = document.querySelector('header button[aria-label^="Выйти"]').getBoundingClientRect()
      return { overflow: row.scrollWidth > row.clientWidth + 1, right: btn.right, vw: window.innerWidth }
    })
    if (r.overflow || r.right > r.vw) clipped.push(`${width}px`)
  }
  check('шапка 768–1440 px: содержимое помещается, кнопка выхода видна', clipped.length === 0, clipped.join(', '))
  check('шапка: без ошибок', errors.length === 0, errors.join(' | '))
  await context.close()
}

// 7. Поворот экрана (альбомная ориентация телефона) в Mini App.
{
  const { context, page, errors } = await openPage({ width: 390, height: 800 })
  await page.goto(launchUrl({ platform: 'ios' }))
  await page.getByRole('button', { name: /Explore demo mode/ }).waitFor({ timeout: 10000 })
  await enterDemo(page)
  await page.setViewportSize({ width: 800, height: 390 })
  await receive(page, 'viewport_changed', { height: 390, is_state_stable: true, is_expanded: true })
  await receive(page, 'safe_area_changed', { top: 0, bottom: 21, left: 47, right: 47 })
  await page.waitForTimeout(200)
  const box = await page.locator('nav[aria-label="Основная навигация"]').boundingBox()
  const padLeft = await page.locator('nav[aria-label="Основная навигация"]').evaluate((el) => getComputedStyle(el).paddingLeft)
  check('поворот: панель у нижнего края', Math.abs(box.y + box.height - 390) <= 2, JSON.stringify(box))
  check('поворот: боковые safe area учтены', padLeft === '47px', padLeft)
  check('поворот: нет горизонтальной прокрутки', await noHorizontalScroll(page))
  const logout = await page.locator('header button[aria-label^="Выйти"]').boundingBox()
  check('поворот: кнопка выхода в видимой области', logout && logout.x + logout.width <= 800 - 47 + 1, JSON.stringify(logout))
  check('поворот: без ошибок', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: path.join(shots, '07-landscape.png') })
  await context.close()
}

await browser.close()
server.close()
console.log(failed === 0 ? `\nE2E Mini App: все ${passed} проверок пройдены.` : `\nE2E Mini App: провалено ${failed} из ${passed + failed}.`)
process.exit(failed === 0 ? 0 : 1)
