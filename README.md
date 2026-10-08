# Mara OS

Операционная система виртуального AI-креатора **Mara Quinn** (23+, Чикаго,
маркетинг-координатор, «365 дней, чтобы выкупить своё время»): фан-база,
диалоги с human-in-the-loop AI, контент-конвейер, офферы, выручка, аналитика
и Telegram-компаньон. Все персонажи и данные демо-режима вымышлены.

![stack](https://img.shields.io/badge/React%2019-Vite%207-61dafb) ![styles](https://img.shields.io/badge/Tailwind%20CSS-4-38bdf8) ![backend](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Auth-3fcf8e) ![telegram](https://img.shields.io/badge/Telegram-Bot%20%2B%20Mini%20App-2AABEE)

## Возможности

| Экран | Что внутри |
|---|---|
| **Overview** | Командный центр: действия на одобрение, pipeline диалогов, MRR/net revenue, прогресс истории «270 из 365 дней», ряды выручки, воронка, AI-заметки |
| **Fans** | CRM фан-базы: сегменты (New / Active / Subscribers / Buyers / Inner circle / At Risk), поиск, сортировка по LTV и активности, пагинация |
| **Профиль фана** | Обзор (LTV-разбивка, подписка, тиры), диалог, воспоминания (auto-memory от Memory Agent с confidence), покупки, события, заметки продаж |
| **Conversations** | Единый инбокс Fanvue + Telegram. **AI-черновики с human approval**: Conversation Agent (intent/sales action), Sales Agent (business rules), Memory Agent (дедупликация). Generate reply → draft → Edit / Regenerate / Approve — ничего не отправляется само |
| **Content** | Контент-конвейер: статусы idea → draft → ready → scheduled → published, фильтры по платформе (TikTok / Instagram / Threads / Fanvue), производительность |
| **Episodes** | История 365 дней сериями: статусы, лор, связанные PPV-дропы |
| **Assets** | Хранилище ассетов: банк лиц, PPV-сеты, соц-ролики — с привязкой к контенту и санкционированным использованием |
| **Offers / Revenue** | Подписка Standard, PPV-сеты, бандлы, VIP; транзакции по фану, выручка по источникам и офферам, топ-спендеры |
| **Analytics** | Метрики за период (7/30/90d), воронка visitor → buyer, графики, AI-инсайты Analytics Agent |
| **AI Studio** | Шесть агентов (Character / Conversation / Memory / Sales / Content / Analytics), карточки с success rate, «Run now» выполняет реальный вызов (Content/Analytics), журнал ai_runs |
| **Automations** | Автоматизации из событий (welcome sequence, churn rescue, PPV follow-up) — включение только человеком, журнал запусков |
| **Tasks** | Рабочий список решений: от AI-агентов и ручные, приоритеты и даты |
| **Settings** | Характер персоны (единый источник истины для агентов), поведение AI, платформы, команда, безопасность, **Telegram-привязка** |
| **Telegram Assistant** | Бот-компаньон: `/fans` `/messages` `/content` `/analytics` `/tasks` `/ai` `/link` `/unlink` `/menu` — живые экраны, Mini App-кнопка, deep links в разделы консоли |

## AI-слой (`src/lib/ai/`)

Провайдер-абстракция (`AIProvider`) + шесть агентов со структурированными
JSON-ответами и оркестратор:

- **MockAIProvider** — работает без API-ключа, детерминированные ответы, помечает
  вывод `mock: true`; UI показывает бейдж «mock provider».
- **ConversationAgent** — черновик ответа голосом персоны + intent + sales_action +
  confidence + кандидат в память; встроенная проверка «не звучит как AI».
- **SalesAgent** — решение `recommend_offer | nurture | wait | no_sales` с
  business rules: холодному фану не продаём, без офферов — no_sales, низкая
  уверенность понижает до wait.
- **MemoryAgent** — извлекает факты из диалога, дедуплицирует против существующих
  воспоминаний.
- **Human-in-the-loop**: агенты только предлагают. Отправки, PPV, цены, удаления
  и включение автоматизаций — за кнопкой человека (`approveDraft`).

Подключение боевого провайдера: реализуйте `AIProvider` (server-side HTTP-шлюз к
LLM; ключ только на сервере, никогда не `VITE_*`) и передайте его в
`AiOrchestrator` вместо `MockAIProvider`.

## Архитектура

```
src/
  pages/            17 экранов (Overview … Settings) на единой дизайн-системе
  components/       угол компонентов: ui/ (Button, Card, Data, Overlays…), layout/, common/
  repositories/     интерфейсы (types.ts) + demo (localStorage поверх вымышленного
                    датасета src/data/*) + supabase (RLS-таблицы) + сервис-локатор
  lib/ai/           провайдер, мок, агенты, оркестратор
  lib/integrations/ fanvue/social адаптеры (mock до верификации API), telegram
  lib/events/       шина событий (воронка, автоматизации; demo → store, cloud → Supabase)
  context/          AuthContext (supabase ⇄ demo переключение на лету)
bot/                ядро Telegram-бота (транспортно-независимое)
supabase/
  migrations/       схема CRM + RLS + link_telegram_account
  functions/telegram-api/  Edge Function (webhook бота; core/format — копии bot/)
scripts/            сборочные и smoke-утилиты
tests/              unit (AI + репозитории), mini-app, telegram
```

Данные: `UI → repositories → (demo | supabase)` — один контракт, режимы
переключаются без перезагрузки. Без ключей Supabase приложение живёт в демо-режиме
(вымышленные данные в браузере), с ключами — в облаке с RLS.

Ключевая схема БД: `characters, character_traits, fans, fan_memories,
conversations, messages, episodes, content, assets, content_performance,
offers, purchases, subscriptions, revenue_events, tasks, ai_runs, ai_insights,
automations, automation_runs, events` + инфраструктура `profiles,
telegram_links, telegram_link_codes` (сохранена без изменений).

## Локальный запуск

```bash
npm install
npm run dev        # http://localhost:5173 — сразу демо-режим (данные вымышлены)
# облачный режим: cp .env.example .env и подставьте VITE_SUPABASE_URL/ANON_KEY
```

## Проверки

```bash
npm run typecheck  # строгий TypeScript, без any-обходов
npm test           # 86 тестов: AI-агенты, business rules, демо-репозитории, mini-app, ядро бота
npm run smoke      # демо-флоу (signin → данные → AI-пайплайн → approve), рендер 17 экранов,
                   # договоры Telegram API/config/setup
npm run build      # tsc -b + vite build
npm run check:dist # no secret leakage, no localhost links, хэш-имена чанков
npm run check      # всё вместе
```

## Деплой

- **Сайт**: статическая сборка на GitHub Pages (base в `vite.config.ts`),
  workflow `.github/workflows/deploy.yml`: typecheck → test → smoke → build →
  check-dist → deploy.
- **Edge Function**: `supabase functions deploy telegram-api` (копии
  `bot/core.mjs`/`format.mjs` синхронизируются вручную — расхождение ловит тест).
- **Бот**: `npm run bot:setup` (webhook, описание, команды, кнопка Mini App) или
  `npm run bot:start` для long-polling. Кнопки `web_app` требуют публичный HTTPS
  `WEB_APP_URL`.
- **Секреты** (GitHub Actions / supabase secrets, никогда не в репозиторий):
  `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
  `OPENAI_API_KEY` (когда подключится реальный провайдер).
  В `VITE_*` — только публичные: anon key, имя бота, адрес API.

## Технологии

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 · Supabase
(PostgreSQL + Auth + RLS + Edge Functions) · Telegram Bot API + Mini Apps ·
node:test + esbuild.

Лицензия: MIT. Персонаж Mara Quinn и весь демо-контент — художественный вымысел.
