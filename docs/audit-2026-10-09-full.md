# Полный аудит Mara OS — 2026-10-09

Ревизия: рабочая ветка `arena/7f2cefd9-moraos-v2` от `bd4045a` (merge PR #25).
Аудит выполнен после перевода интерфейса, бота и демо-данных на русский язык.

---

## 1. Что проверено и чем

| Проверка | Команда | Результат |
|---|---|---|
| Линтер | `npm run lint` | **0 ошибок**, 1 предупреждение (`react-hooks/exhaustive-deps`) |
| Типы | `npm run typecheck` (`tsc -b --noEmit`) | чисто, 0 ошибок |
| Тесты | `npm test` (3 набора, `node:test`) | **131 пройдено, 0 провалено**: unit 49/49, mini-app 36/36, telegram 46/46 |
| Смоук | `npm run smoke` (5 скриптов) | **114 проверок OK**, 0 провалов; демо-режим отрендерил 17 маршрутов без ошибок |
| Сборка | `npm run build` | успешно, `dist/` = 1,6 МБ; крупнейший чанк `index-*.js` 373,7 КБ (gzip 116,7 КБ) |
| Целостность dist | `npm run check:dist` | все проверки пройдены |
| Копии Edge Function | `npm run sync:edge -- --check` | `Копии Edge Function совпадают с bot/.` |
| Зависимости | `npm audit` и `npm audit --omit=dev` | **0 уязвимостей** (9 runtime- и 16 dev-зависимостей) |
| E2E Mini App | `npm run e2e` | **не запускался**: в песочнице нет браузера (Chromium не устанавливается). Скрипт обновлён под русский UI, синтаксис проверен `node --check` |

Объём кода: 119 файлов TypeScript/MJS/SQL в `src`, `bot`, `scripts`, `tests`, `supabase`;
`src` — 17 515 строк, `bot` + `scripts` — 5 226 строк. 5 миграций, 2 workflow, 17 маршрутов.

---

## 2. Критично: Telegram-бот не развёрнут и не перенастроен

Код бота в репозитории актуальный, но на стороне Telegram он не обновлялся.

**Доказательство.** `gh api repos/Andrey1904-dev/MaraOS-v2/actions/workflows/371042326/runs`
возвращает `total_count = 0` — workflow «Telegram bot — Mini App setup»
(`.github/workflows/telegram-bot.yml`, только `workflow_dispatch`) не запускался ни разу.
Именно он (или локальный `npm run bot:setup`) единственный вызывает
`setMyDescription`, `setMyShortDescription`, `setMyCommands`, `setChatMenuButton`, `setWebhook`.
Значит живой бот до сих пор несёт описание, список команд, URL Mini App и webhook
прежнего проекта. Сайт при этом актуален: Pages собран, `pages.status = built`.

**Что сделать владельцу** (из песочницы невыполнимо — нет доступа к секретам и к api.telegram.org):

1. GitHub Actions → «Telegram bot — Mini App setup» → Run workflow, `mode: full`, `deploy: true`.
   Секреты: `TELEGRAM_BOT_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
   Переменные: `WEB_APP_URL`, `SUPABASE_PROJECT_REF` (по умолчанию `dcgurmwvpgzmlfivxoso`).
   Либо локально: `npm run bot:setup -- --deploy`.
2. Применить миграции `0001`→`0005` (`0005_telegram_notifications.sql` обязателен для `/settings`).
3. Задать `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` в секретах Supabase (не `VITE_*`).
4. Задать `VITE_TELEGRAM_BOT_USERNAME` и `VITE_TELEGRAM_API_URL` для сайта.
5. Поставить cron для `scripts/telegram-notify.mjs` (opt-in дайджест).
6. Если бота переименовывали в прежнем проекте — имя меняется только в BotFather:
   `telegram-bot-setup.mjs` не вызывает `setMyName`.

После перевода все тексты бота (описание, 16 команд, экраны, дайджест, ошибки) — русские,
но увидит их пользователь только после шага 1.

---

## 3. Риски и замечания

| № | Уровень | Находка |
|---|---|---|
| R1 | Критично | Бот не развёрнут и не перенастроен (раздел 2). |
| R2 | Высокий | Миграции `0001`–`0005` не подтверждены как применённые к проекту `dcgurmwvpgzmlfivxoso`. Без `0005` экран `/settings` честно сообщает о недостающей миграции. |
| R3 | Высокий | Секреты и переменные GitHub недоступны для проверки из песочницы (`403 Resource not accessible by integration`). Наличие `TELEGRAM_BOT_TOKEN`, `WEB_APP_URL`, `SUPABASE_PROJECT_REF` **не подтверждено**. |
| R4 | Средний | AI в веб-консоли — mock-провайдер; результаты помечены «(mock)». `HttpAIProvider` готов, но требует серверных ключей. |
| R5 | Средний | Доставка сообщений фанам не подключена: одобрение черновика только меняет `status = approved`. Поведение намеренное и честно подписано в UI, но это ограничение продукта. |
| R6 | Средний | Главный чанк 373,7 КБ (gzip 116,7 КБ) — выше желательного порога 100 КБ gzip; стоит вынести тяжёлые страницы в ленивую загрузку. |
| R7 | Низкий | 1 предупреждение линтера: `src/components/content/ContentEditorPanel.tsx:68` — неполный список зависимостей `useEffect`. |
| R8 | Низкий | E2E Mini App не прогнан в этой среде (нет браузера). Перед деплоем его выполнит CI (`deploy.yml`, `E2E_REQUIRED=1`). |
| R9 | Низкий | Workflow бота — только ручной. Регрессия конфигурации бота не обнаружится автоматически. |
| R10 | Информационно | Служебные значения (`status`, `relationship`, `kind`, `cadence`, `group`-ключи) остались английскими — это часть схемы БД и типов; на экране переводятся через `src/lib/labels.ts`. |

---

## 4. Состояние перевода (выполнено в этой ревизии)

- **UI**: все страницы (`Overview`, `Fans`, `FanProfile`, `Conversations`, `Content`, `ContentEditor`,
  `Episodes`, `Assets`, `Offers`, `Revenue`, `Analytics`, `AIStudio`, `Automations`, `Tasks`,
  `Settings` + `TelegramSection`, `AuthPage`), компоненты layout/UI/common, `index.html` (`lang="ru"`).
- **Форматирование**: `src/lib/format.ts` — `ru-RU`, русские относительные даты, `pluralRu`.
- **Демо-данные**: `src/data/{ops,content,fans}.ts` — персонаж, метрики, инсайты, агенты,
  автоматизации, задачи, сюжет, эпизоды, контент, ассеты, офферы, фаны, воспоминания,
  события, покупки, диалоги и сообщения.
- **AI-слой**: mock-провайдер и фолбэки агентов отвечают по-русски; системные промпты
  требуют русского ответа.
- **Бот**: `bot/{core,format,ai,api,server}.mjs` — экраны, кнопки, команды, описание бота,
  дайджест, ошибки; добавлен `pluralRu`; копии синхронизированы в `supabase/functions/telegram-api/`.
- **Тесты и смоук**: `tests/telegram.test.mjs`, `scripts/smoke-telegram-{config,api}.mjs`,
  `scripts/e2e-mini-app.mjs` обновлены под русские строки.
- **README**: строка «Интерфейс — английский» заменена на описание русской локализации
  и правила перевода служебных значений.

Проверка на случайные нелатинские/иноязычные вкрапления в русских строках: 0 совпадений.

---

## 5. Рекомендации по приоритету

1. Запустить workflow бота в режиме `full` + `deploy` и проверить `/status` в чате (R1).
2. Применить миграции и сверить схему с `docs/migration-map.md` (R2).
3. Проверить секреты/переменные окружения в настройках репозитория (R3).
4. Подключить реальный AI-провайдер на серверной стороне и снять mock с веб-консоли (R4).
5. Разбить главный бандл и убрать предупреждение линтера (R6, R7).
6. Прогнать `npm run e2e` в среде с браузером до публикации (R8).
