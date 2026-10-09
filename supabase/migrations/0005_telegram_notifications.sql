-- ============================================================================
-- Миграция 0005 — настройки Telegram-уведомлений (opt-in дайджест)
--
-- Зачем: бот Mara OS умеет присылать дайджест (новые задачи, переписки,
-- ожидающие решения, итоги AI-запусков, ошибки автоматизаций, изменения
-- метрик), но только при явном согласии владельца — переключатель /settings
-- в чате. По умолчанию ВЫКЛЮЧЕНО (enabled = false).
--
-- Модель доступа:
--   • читать строку может владелец из веб-консоли (RLS: auth.uid() = user_id);
--   • писать может только сервер бота под service-role ключом (минует RLS):
--     переключатели живут в /settings бота, watermark обновляет notify-задача;
--   • anon ничего не получает.
--
-- watermark — метки «последнего учтённого события» по каждому разделу, чтобы
-- дайджест не присылал одно и то же дважды. Обновляется ПОСЛЕ успешной
-- отправки (scripts/telegram-notify.mjs).
--
-- Идемпотентно. Порядок: 0001 → 0002 → 0003 → 0004 → 0005.
-- ============================================================================

create table if not exists public.telegram_notification_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  -- Главный переключатель дайджеста. false = бот молчит, что бы ни стояло ниже.
  enabled             boolean not null default false,
  notify_tasks        boolean not null default true,
  notify_inbox        boolean not null default true,
  notify_ai           boolean not null default true,
  notify_automations  boolean not null default true,
  notify_metrics      boolean not null default true,
  watermark           jsonb   not null default '{}',
  last_notified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.telegram_notification_settings enable row level security;

-- Владелец читает свои настройки (веб-консоль, раздел Settings).
drop policy if exists "telegram_notification_settings: own row read" on public.telegram_notification_settings;
create policy "telegram_notification_settings: own row read"
  on public.telegram_notification_settings for select
  using (auth.uid() = user_id);

-- Запись намеренно не разрешена anon/authenticated: изменения идут через бота
-- (service-role). grant select владельцу, остальное — только service_role.
revoke all on table public.telegram_notification_settings from public, anon;
grant select on table public.telegram_notification_settings to authenticated;
grant all on table public.telegram_notification_settings to service_role;

-- Обновление updated_at (функция set_updated_at из миграции 0002, имя триггера
-- — по конвенции <таблица>_set_updated_at).
drop trigger if exists telegram_notification_settings_set_updated_at on public.telegram_notification_settings;
create trigger telegram_notification_settings_set_updated_at
  before update on public.telegram_notification_settings
  for each row execute function public.set_updated_at();
