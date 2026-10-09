# Telegram Mini App

Сайт Mara OS открывается внутри Telegram как Mini App. Документ описывает поведение,
настройку в BotFather и способ проверки. Код: `src/lib/telegram-mini-app.ts`,
`src/components/TelegramMiniAppBridge.tsx`.

## Поведение

| Что | Как |
|---|---|
| Загрузка SDK | `https://telegram.org/js/telegram-web-app.js`, ждём не дольше 3,5 с; нет SDK — сайт открывается как обычный |
| Вне Telegram | Интеграция не включается: класс `tg-mini-app` не ставится, запросов к telegram.org нет |
| Оформление | Шапка `#08090A`, нижняя панель `#0B0C0E`; цвета выставляются только на Bot API ≥ 6.1 (раньше — не вызываются) |
| Высота и отступы | `viewport_changed` и `safe_area_changed` → CSS-переменные `--tg-app-viewport-stable-height`, `--tg-app-inset-*` |
| Кнопка «Назад» | Показывается на вложенных разделах, скрыта на `/` и на экране входа. Без внутренней истории ведёт на родительский раздел |
| Закрытие | Корень кабинета не закрывает Mini App кнопкой «Назад» |
| Ссылки | `t.me/…` открываются внутри Telegram (`openTelegramLink`); внешние — во внешнем браузере (`openLink`); новых вкладок WebView не создаёт |
| Файлы | В мобильном клиенте Blob-скачивание не работает: предлагается «Поделиться» или открытие сайта в браузере. Подтверждения — нативным попапом Telegram |
| Перезагрузка | Параметры запуска SDK сохраняет в `sessionStorage`; текущий раздел восстанавливается |

Параметры запуска Telegram (`tgWebAppData` и др.) убираются из адреса сразу после чтения.

## Deep links и `?screen=`

Разрешены только короткие ключи из белого списка `START_ROUTES`:

| Ключ | Раздел |
|---|---|
| `home`, `dashboard` | главная `/` |
| `fans` | `/fans` |
| `messages`, `conversations`, `inbox` | `/conversations` |
| `content` | `/content` |
| `episodes` | `/episodes` |
| `analytics` | `/analytics` |
| `revenue` | `/revenue` |
| `tasks` | `/tasks` |
| `ai` | `/ai` |
| `automations` | `/automations` |
| `settings`, `bot`, `telegram` | `/settings` |

Неизвестные, пустые и опасные значения (`..%2Fauth`, `//evil.example`) игнорируются:
открывается главная. Ключ из `startapp` имеет приоритет над `?screen=`.

Ссылки:
- из кнопки бота (web_app): `https://<site>/?screen=telegram` — открывает раздел Telegram в настройках;
- прямая ссылка на Mini App: `https://t.me/<bot>?startapp=fans` (нужна регистрация Main Mini App, см. ниже);
- из другого приложения: `https://t.me/<bot>/<short_name>?startapp=fans` (`<short_name>` — имя, заданное в BotFather).

## Настройка в BotFather

1. `/newapp` или `/myapps` → выберите бота → укажите URL сайта (`https://<owner>.github.io/MoraOS-v2/`).
2. Для прямых ссылок `?startapp=` зарегистрируйте Main Mini App (`/newapp` → Main Mini App) с тем же URL.
3. Кнопка меню бота ставится скриптом: `npm run bot:menu` (или workflow «Telegram bot — Mini App setup»).

Адрес сайта задаётся переменной `WEB_APP_URL` (без хэша `#/…`). Адрес должен быть HTTPS.

## Проверка

Автоматически — `npm run e2e` (нужен `npm run build`). Тест проверяет на production-сборке:
вход вне Telegram, отказ SDK, основной сценарий (шапка, `initData`, BackButton, viewport и safe area,
ссылки, экспорт в мобильном клиенте), deep links, Bot API 6.0 без новых методов, ширину 320 px,
шапку на 768–1440 px и поворот экрана.

Вручную в Telegram (после настройки BotFather):

1. Открыть бота → кнопка «Mara OS» → сайт открывается сразу на экране входа.
2. Войти в демо → «Назад» со вложенного раздела возвращает на главную; на главной кнопки нет.
3. Открыть `https://t.me/<bot>?startapp=fans` → после входа открывается «Fans».
4. В разделе Fans нажать «Export CSV» → предлагается открыть сайт в браузере.
5. В Settings → Telegram ввести код из `/link` → сначала показывается аккаунт, затем подтверждение.

## Ограничения

- Прямые ссылки `?startapp=` работают только после регистрации Main Mini App в BotFather.
- Версии клиентов Telegram старше Bot API 6.0 открывают сайт без BackButton и без цвета шапки.
- Оплаты и подписки Telegram не подключены: офферы в приложении — образец.
