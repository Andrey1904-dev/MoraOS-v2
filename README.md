# Mara OS

Операционная система виртуального AI-креатора: CRM фан-базы, инбокс с AI-черновиками
(человек одобряет каждое решение), контент-конвейер, офферы, выручка, аналитика и
Telegram-ассистент с Mini App.

Интерфейс — английский. Документация проекта — русская.

## Статус: что работает, а что нет

Честная картина, чтобы не принимать витрину за интеграции.

| Область | Состояние |
|---|---|
| Демо-режим (вымышленные данные в браузере) | Работает полностью |
| Облачный режим (Supabase Auth + RLS) | Работает: CRM-таблицы, переписки, одобрение черновиков, экспорт/удаление фана, контент, эпизоды, аналитика, задачи, автоматизации, AI-журнал |
| Одобрение ответа | Записывает решение (`status = approved`). **Доставка фанам не подключена**: сообщение нигде не отправляется |
| AI-черновики | Mock-провайдер в UI; `HttpAIProvider` — готовый OpenAI-совместимый скелет для server-side (бот/Edge Function), переменные `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` |
| Telegram-бот и Mini App | Работают: `/fans`, `/messages`, `/content`, `/episodes`, `/analytics`, `/revenue`, `/tasks`, `/ai` (агенты + брифинги + идеи), `/automations`, `/status`, `/settings`, модерация AI-черновиков из чата, opt-in дайджест, привязка аккаунта с предпросмотром |
| AI в Telegram-боте | Брифинги и идеи через реальный OpenAI-совместимый провайдер (серверные `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`), вызовы пишутся в `ai_runs`, лимит 30/час на аккаунт. Без ключа — честное «провайдер не настроен», никаких выдумок |
| Уведомления в Telegram | Opt-in дайджест (`/settings` → Digest; по умолчанию выключен): новые задачи, инбокс-решения, итоги AI-запусков, ошибки автоматизаций, метрики. Доставка — `scripts/telegram-notify.mjs` под cron, watermark против дублей |
| Fanvue, TikTok, Instagram, Threads | **Не подключены** (интеграций нет, в интерфейсе они помечены как «Not connected»; где данных нет — N/A, не фейк) |
| Автоматизации | Включение/выключение, запуск вручную, пауза всех, счётчик запусков; **автоматического исполнения по расписанию нет** |
| Создание/редактирование контента и эпизодов | Работает (через репозитории); создание/редактирование фанов пока не реализовано |

## Разделы интерфейса

| Раздел | Что есть |
|---|---|
| Overview | 8 KPI, графики выручки/аудитории, очередь действий |
| Fans | Список с поиском, сегментами, сортировкой, экспорт CSV текущего вида |
| Fan profile | Досье, покупки, воспоминания (без дубликатов), переписка; экспорт и удаление |
| Conversations | Инбокс: черновик AI → одобрение/редактирование; ответ оператора (approved, не «sent») |
| Content | Канбан-столбцы, редактор контента (title/hook/script/cta/status/schedule), сохранение, удаление |
| Episodes | Таймлайн серий с нодами по статусу, раскрывающиеся карточки с битами/retention/релевантным контентом/ассетами; создание и удаление эпизодов, байбл истории |
| Assets, Offers, Revenue | Библиотека превью, офферы, выручка с реальными суммами из покупок; отсутствующие метрики помечены N/A |
| Analytics | 5 вкладок (Content/Audience/Revenue/Conversion/Retention), воронка конверсий, retention chart, топ-контент со спарклайнами, AI read-out панель, decision log |
| AI Studio | Канонические ID агентов (`content`, `memory`, `conversation`, `sales`, `analytics`, `character`), журнал запусков |
| Automations | Вкл/выкл, «Run now», «Pause all», счётчик запусков, следующий запуск |
| Tasks | Задачи от агентов и ручные, приоритет/группа/due |
| Settings | Персонаж, сброс демо (с событием `demo_reset`), **Telegram** (привязка в два шага) |

## Архитектура

```
src/
  pages/              экраны; каждый грузится лениво по маршруту
  components/         ui/ (кнопки, карточки, таблицы), layout/, common/
  repositories/       контракт (types.ts), demo.ts (вымышленный датасет + стор),
                      supabase.ts (таблицы под RLS), index.ts — сервис-локатор
  lib/ai/             провайдер, mock, агенты, оркестратор
  lib/events/         trackEvent: demo → стор, cloud → таблица events
  lib/export.ts       CSV и JSON-досье (защита от CSV-инъекций)
  lib/telegram*.ts    клиент API бота и интеграция Mini App
  context/            AuthContext (переключение демо ⇄ облако на лету)
bot/
  core.mjs            логика бота (тексты, команды, работа с Supabase)
  api.mjs             HTTP-слой API: маршруты, методы, CORS, лимиты, /health
  format.mjs          коды привязки, сравнение секретов, форматирование
  ai.mjs              серверный AI-клиент (OpenAI-совместимый; без ключа — честный отказ)
  server.mjs          Node-транспорт (long polling)
supabase/
  migrations/         0001 → 0005 (порядок важен, см. docs/setup.md)
  seed/               демо-сид (вручную, для одного владельца)
  functions/telegram-api/   Edge Function: webhook и API. core/format/api — копии bot/
scripts/              настройка, smoke-тесты, e2e, проверка сборки,
                      telegram-notify.mjs — cron-доставка дайджестов (opt-in)
tests/                юнит-тесты, Mini App, бот и API
```

Данные идут по одному пути: `UI → repositories → (demo | supabase)`. Режимы
переключаются без перезагрузки. Без ключей Supabase приложение работает только в демо.

### События (`trackEvent`)

Реально отправляются: `reply_approved`, `ai_generated`, `fan_exported`, `fan_erased`,
`demo_reset`. Остальные типы в `src/lib/events/index.ts` зарезервированы и пока не
используются.

## Локальный запуск

```bash
npm ci
npm run dev        # http://localhost:5173 — демо-режим (данные вымышлены)
```

Облачный режим: `cp .env.example .env`, укажите `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

## Проверки

```bash
npm run lint         # ESLint (flat config, react-hooks)
npm run typecheck    # строгий TypeScript
npm test             # юнит-тесты, Mini App, бот и API (≈100 тестов)
npm run smoke        # демо-сценарий, контракты Telegram API, config и setup
npm run build        # сборка для GitHub Pages (base из site.config.json)
npm run check:dist   # в сборке нет секретов и localhost-адресов
npm run sync:edge -- --check   # копии общих модулей бота совпадают
npm run check        # всё вместе
npm run e2e          # Mini App в настоящем Chrome (нужен npm run build)
E2E_ONLY=1,3 npm run e2e   # выбранные сценарии
```

Для e2e нужен Chrome (`CHROME_PATH` или установленный Google Chrome). Без браузера тест
пропускается; с `E2E_REQUIRED=1` это ошибка (так и сделано в CI).

## Деплой

- **Сайт** — GitHub Pages, `.github/workflows/deploy.yml`: проверки → сборка → e2e → публикация
  (публикация из `main` не отменяется параллельными прогонами).
- **Edge Function и бот** — `.github/workflows/telegram-bot.yml` (ручной запуск) или
  `npm run bot:setup -- --deploy`. Подробности: [docs/setup.md](docs/setup.md).
- **Секреты** — только в секретах Supabase / GitHub Actions, не в репозитории.
  В `VITE_*` попадают только публичные значения: anon key, имя бота, адрес API.

## Документация

- [docs/setup.md](docs/setup.md) — пошаговая настройка: Supabase, миграции, Auth, бот, Pages.
- [docs/telegram-mini-app.md](docs/telegram-mini-app.md) — Mini App: поведение, deep links, проверка.
- [docs/compliance-checklist.md](docs/compliance-checklist.md) — юридические решения, которые принимает владелец.
- [docs/audit-2026-10-08.md](docs/audit-2026-10-08.md) — аудит и статус исправлений.
- [docs/migration-map.md](docs/migration-map.md) — историческая карта перехода с прежней схемы.

## Технологии

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, RLS,
Edge Functions) · Telegram Bot API и Mini Apps · node:test · Playwright (e2e).

## Лицензия

MIT — см. [LICENSE](LICENSE).
