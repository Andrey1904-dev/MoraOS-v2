> **Историческая карта.** Описывает переход с прежней автомобильной схемы (LADA) на Mara OS.
> Актуальный порядок миграций — в [setup.md](setup.md). Файлы `supabase/legacy/` и прежние
> `schema.sql`/`telegram.sql` удалены; их можно посмотреть в истории git (коммит 086937e и ранее).

# Mara OS — Migration Map

Трансформация `MoraOS-v2` (LADA Кредит & Гараж) в **Mara OS** — операционную
систему виртуального AI-креатора. Репозиторий, Supabase-проект, Telegram-бот и
инфраструктура сохраняются; предметная область заменяется полностью.

## Источники

| Источник | Роль |
|---|---|
| `Andrey1904-dev/MoraOS-v2` | Финальный репозиторий. Техническая инфраструктура: Supabase Auth, демо-режим, Telegram bot/transports, Mini App, CI, smoke/e2e |
| `Andrey1904-dev/MaraOSv01` | Ссылочный UI (Next.js) — структура разделов и UX-паттерны |
| `Andrey1904-dev/MaraOS-Design` | Vite-порт того же UI — основной источник дизайна (приоритет выше MaraOSv01) |

## Что сохраняется из MoraOS-v2

- `src/lib/config.ts`, `src/lib/index.ts` — Supabase config и переключатель «демо ⇄ облако».
- `src/lib/authErrors.ts`, `src/lib/email.ts` — обработка ошибок Auth.
- `src/context/AuthContext.tsx` — сессии, вход/регистрация/демо.
- `src/lib/telegram.ts` — клиент привязки Telegram (link code flow), без изменений контракта.
- `src/lib/telegram-mini-app.ts` + `TelegramMiniAppBridge` — Mini App bootstrap/deep links.
- `bot/server.mjs` (Node transport), `supabase/functions/telegram-api/` (Edge Function transport) — транспорты без изменений; переписываются только экраны/тексты/команды в `core.mjs`/`format.mjs`.
- `supabase/telegram.sql` — механизм привязки аккаунтов (`telegram_links`, `telegram_link_codes`, `link_telegram_account`) без изменений.
- `scripts/*` smoke/e2e/test-инфраструктура, GitHub Actions workflows.
- `profiles` таблица и триггер `handle_new_user`.

## Что удаляется (LADA-домен)

- Страницы `Dashboard/Credit/Expenses/Garage/Service`, компоненты `credit/*`, `service/*`, `AddTransactionSheet`, графики расходов.
- `src/lib/{backup,ownership,service,tax,categories,assets,settings,local}.ts` (старые), `src/utils/{loan,fuel,stats}.ts`, `src/types/domain.ts`.
- Данные авто в БД: таблицы `cars/loans/transactions/maintenance` → архивируются миграцией (переименование в `legacy_*`), см. `supabase/migrations/`.
- Изображения `public/images/lada-*`, старая аватарка бота.
- Автомобильные команды бота: `/garage /service /spending /credit`.

## Новая модель данных (Supabase)

Базовые таблицы (все с RLS, владелец — `user_id`):

- `characters`, `character_traits` — персонаж Mara Quinn, характер/voice/lore.
- `fans`, `fan_memories`, `fan_segments` — CRM.
- `conversations`, `messages` (sender fan/mara/system, AI drafts, approval).
- `content`, `content_performance`, `episodes`, `assets` (+tags) — контент-фабрика.
- `offers`, `purchases`, `subscriptions`, `revenue_events` — монетизация.
- `tasks`, `ai_runs`, `ai_insights`, `automations`, `automation_runs`, `events`.
- Storage buckets: `mara-assets`, `content`, `avatars`, `thumbnails`, `private` (private не публичен).

Файлы:

- `supabase/schema.sql` — полная свежая схема (profiles + telegram linking + Mara OS + storage).
- `supabase/migrations/0001_mara_os.sql` — миграция существующего проекта: архив старых таблиц + создание Mara-схемы. Ничего не дропает.
- `supabase/legacy/` — бэкап прежних `schema.sql`/`telegram.sql` до миграции.
- `supabase/seed/mara_seed.sql` — вымышленный датасет Mara Quinn.

## Frontend

- UI целиком из MaraOS-Design (Vite) → `src/components/{layout,ui,common,content}`, `src/pages/*` (Overview, Fans, FanProfile, Conversations, Content, ContentEditor, Episodes, Assets, Offers, Revenue, Analytics, AIStudio, Automations, Tasks, Settings).
- Auth: `/auth` — рестайл в тёмный Mara-дизайн; защищённые роуты; вход/выход; демо-кнопка сохранена.
- Data flow: `UI → repositories → (Supabase | demo store)`. Сервис-локатор `src/lib/repositories` сам выбирает реализацию по режиму (как старый `getBackend()`), компоненты не знают о переключении.
- Telegram-привязка переезжает в `Settings → Telegram` (клиент `lib/telegram.ts` и API-контракт бота без изменений).
- Mini App: открывает Mara OS; deep links `settings/telegram` и разделы.

## AI layer (`src/lib/ai/`)

- `provider.ts` — интерфейс `AIProvider` (`generate`, `generateStructured`, `embed`), фабрика.
- `mock.ts` — `MockAIProvider` (работает без ключа; помечает вывод `mock`).
- Агенты: `character-agent`, `conversation-agent`, `memory-agent`, `sales-agent`, `content-agent`, `analytics-agent` — структурированные входы/выходы.
- `orchestrator.ts` — конвейер событий → агенты → draft → human approval.
- Каждый вызов логируется в `ai_runs` (agent/input/output/status/model/duration).
- Реальный провайдер подключается server-side (`AI_API_KEY`, никогда не `VITE_*`); веб-клиент всегда работает через server proxy или mock.

## Telegram

- Бот: `Mara OS Assistant`, команды `/start /menu /fans /messages /content /analytics /tasks /ai /link /unlink /help`.
- Экраны читают Mara-таблицы (fans, conversations, revenue, tasks, insights) через service-role REST — как раньше читали cars/loans.
- Привязка по одноразовому коду и HTTP API для сайта — без изменений (совместимость `lib/telegram.ts`).

## Фазы выполнения

1. Бэкап легаси-схемы, migration map. ✅
2. Дизайн-система + страницы (порт), auth/splash рестайл.
3. Data layer: типы, демо-стore, репозитории, Supabase-клиент.
4. DB: схема, миграция, seed, storage, `database.types.ts`.
5. AI layer + интеграции (fanvue/social stubs), events.
6. Telegram bot reborn + тесты.
7. Smoke/e2e/package/vite/docs/images.
8. `npm run check` зелёный.
