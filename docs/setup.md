# Настройка Mara OS

Порядок шагов: проект Supabase → миграции → Auth → владелец → бот и Edge Function →
GitHub Pages. Каждый шаг можно проверить отдельно.

## 0. Что нужно

- Node.js 22 или новее (`engines` в `package.json`).
- Проект Supabase. Ref проекта (20 символов) — в Settings → General → Reference ID.
- Бот Telegram: токен от @BotFather.
- Репозиторий на GitHub с включёнными Pages (источник — GitHub Actions).

## 1. Миграции базы

Миграции лежат в `supabase/migrations/` и применяются **по порядку**:

| Файл | Что делает |
|---|---|
| `0001_mara_os.sql` | Переносит прежние автомобильные таблицы в `legacy_*`. На пустом проекте ничего не меняет |
| `0002_mara_os_schema.sql` | Схема Mara OS, RLS, `link_telegram_account` |
| `0003_mara_os_storage.sql` | Приватные бакеты Storage и политики «владелец — своя папка» |
| `0004_telegram_link_safety.sql` | Имя аккаунта Telegram для предпросмотра; общий счётчик попыток `consume_rate_limit` |

Выполнение: Supabase Dashboard → SQL Editor → вставить файл → Run; либо `supabase db push`.
Все файлы идемпотентны: повторный запуск безопасен.

**Без миграции 0004** привязка Telegram не работает: функция не может проверить лимит попыток
и закрывается (fail-closed).

## 2. Аутентификация

Настройки меняются скриптом (нужен personal access token: Dashboard → Account → Tokens):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_…
npm run supabase:auth                       # показать текущие настройки
npm run supabase:auth -- --no-confirm       # регистрация без письма (для первого владельца)
npm run supabase:auth -- --site-url https://<owner>.github.io/MoraOS-v2/
```

- Минимальная длина пароля **8 символов** выставляется на каждом применении скрипта
  и проверяется в приложении при регистрации.
- Свой SMTP: `SMTP_PASS=… npm run supabase:auth -- --smtp --smtp-host … --smtp-user … --smtp-from …`.
  Пароль принимается **только** из переменной `SMTP_PASS`; флаг `--smtp-pass` отвергается.

### Владелец и закрытие регистрации

1. Зарегистрируйте владельца в приложении (экран входа → Create account).
2. Закройте регистрацию: `npm run supabase:auth -- --disable-signup`.
   После этого новых аккаунтов не создать, а вход владельца работает.

## 3. Демо-данные (необязательно)

Сид не привязывается к «первому пользователю» автоматически. Выполните вручную, подставив uuid
владельца из Authentication → Users:

```sql
select public.mara_seed('<uuid владельца>');
```

Данные вымышленные.

## 4. Бот и Edge Function `telegram-api`

Функция — это webhook Telegram и API для сайта. Общие модули бота копируются в её каталог
командой `npm run sync:edge` (проверяется тестом).

### Вариант A: командой с рабочей машины

```bash
export TELEGRAM_BOT_TOKEN=123456:…
export SUPABASE_ACCESS_TOKEN=sbp_…
export SUPABASE_PROJECT_REF=<ref проекта>      # или SUPABASE_URL=https://<ref>.supabase.co
export WEB_APP_URL=https://<owner>.github.io/MoraOS-v2/
npm run bot:setup -- --deploy                  # секреты + деплой функции + webhook + меню
```

Скрипт загружает секреты функции через временный файл (`--env-file`, права 0600, удаляется),
а не аргументами командной строки. Версия Supabase CLI закреплена в `scripts/telegram-bot-setup.mjs`.

Без `--deploy` функция уже должна быть развёрнута, а `TELEGRAM_WEBHOOK_SECRET` обязан
совпадать с секретом функции:

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… WEB_APP_URL=… npm run bot:setup
npm run bot:menu       # только кнопка меню Mini App
```

### Вариант B: GitHub Actions

Actions → «Telegram bot — Mini App setup» → Run workflow. Секреты и переменные:

| Имя | Где | Назначение |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | токен бота |
| `SUPABASE_ACCESS_TOKEN` | Secret | только для режима full с deploy |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | секрет вебхука (режим full без deploy) |
| `SUPABASE_PROJECT_REF` | Variable | ref проекта (по умолчанию — проект из README) |
| `WEB_APP_URL` | Variable | HTTPS-адрес сайта (по умолчанию — GitHub Pages) |

### Секреты функции

Создаются скриптом. Для ручной настройки нужны: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`WEB_APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Передавайте их
через файл: `supabase secrets set --env-file <файл>`.

Опционально: `CORS_ALLOWED_ORIGINS` (через запятую) — дополнительные origin сайта.
`ALLOW_LOCAL_ORIGINS=1` — только для локальной разработки (localhost:5173). В продакшне не задавать.

### Проверка

```bash
curl -s https://<ref>.supabase.co/functions/v1/telegram-api/health
```

Ответ 200 с `"ok": true` — webhook установлен и доставки не падают. Ответ 503 — см. поле `hint`.
В ответе нет адреса webhook и текстов ошибок: они пишутся в журнал функции.

## 5. GitHub Pages: переменные сборки

Settings → Secrets and variables → Actions:

| Имя | Тип | Значение |
|---|---|---|
| `VITE_SUPABASE_URL` | Secret или Variable | `https://<ref>.supabase.co` (по умолчанию — проект из README) |
| `VITE_SUPABASE_ANON_KEY` | Secret | публичный anon/publishable ключ (Project Settings → API) |
| `VITE_TELEGRAM_BOT_USERNAME` | Variable | имя бота без `@` |
| `VITE_TELEGRAM_API_URL` | Variable | `https://<ref>.supabase.co/functions/v1/telegram-api` (полный HTTPS) |

В сборку попадают **только** публичные значения. Токен бота и service-role ключ в `VITE_*` не
кладутся; `npm run check:dist` проверяет это перед публикацией.

## 6. Защита ветки

Требуемые проверки (`build`, `E2E`) включаются в настройках репозитория: Settings → Rules → Rulesets
(или Branches → Branch protection). Это действие владельца репозитория: токен сборки не может
его выполнить (ответ 403). Включайте проверки только после первого зелёного прогона на `main`.

## 7. Локальная разработка

```bash
npm ci
npm run dev                  # демо-режим на http://localhost:5173
npm run bot:local            # бот локально: bot/.env (см. bot/.env.example), ALLOW_LOCAL_ORIGINS=1
npm run build && npm run preview   # превью как на GitHub Pages (с базовым путём /MoraOS-v2/)
```

## 8. Зависимости и обновления

Dependabot открывает PR еженедельно (npm — минорные и патч-версии группой; GitHub Actions — по SHA).

Мажорные версии, которые пока не обновлены, и причины:

- **Vite 8 и @vitejs/plugin-react 6** — сборка падает на `build.rollupOptions.output.manualChunks`
  (новый сборщик rolldown). Нужен перенос разбиения на чанки и повторная проверка e2e.
- **TypeScript 7** — удалён `baseUrl`; нужна миграция `tsconfig` на `paths`.
- **ESLint 10 и eslint-plugin-react-hooks 7** — 14 новых находок (setState в эффекте, refs при рендере).
  Нужен отдельный рефакторинг хуков.

## Частые ошибки

| Сообщение | Причина |
|---|---|
| «API бота не найден (404)» / «не принимает запросы API (405)» | `VITE_TELEGRAM_API_URL` указывает на сайт, а не на функцию |
| «Пароль слишком короткий — минимум 8» | требование регистрации; старые аккаунты входят без ограничения |
| 429 на привязке | лимит 10 попыток за 10 минут на аккаунт; подождите |
| 403 «Origin is not allowed» | адрес сайта не в `WEB_APP_URL` / `CORS_ALLOWED_ORIGINS` |
| «Could not check the request limit» | не применена миграция 0004 |
