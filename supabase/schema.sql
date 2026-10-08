-- ============================================================================
-- Mara OS — схема БД Supabase (PostgreSQL) + Row Level Security
--
-- Операционная система виртуального AI-креатора. Полная свежая установка:
-- profiles + привязка Telegram + предметная область Mara OS.
-- Для проекта, где уже стоит старая (автомобильная) схема, используйте
-- supabase/migrations/0001_mara_os.sql — он архивирует старые таблицы
-- и применяет эту же модель без потери данных.
--
-- Применение: Supabase Dashboard → SQL Editor → вставить весь скрипт → Run
-- (или `supabase db push` при работе через Supabase CLI).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. profiles — профиль владельца кабинета (Supabase Auth)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- Автосоздание профиля при регистрации пользователя
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Профили для аккаунтов, созданных до этой схемы
insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
on conflict (id) do nothing;

-- Обновление updated_at (общий триггер для всех таблиц с этой колонкой)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Перечисления предметной области Mara OS
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'relationship_level') then
    create type public.relationship_level as enum
      ('visitor', 'follower', 'regular', 'fan', 'favorite', 'inner_circle');
  end if;
  if not exists (select 1 from pg_type where typname = 'fan_status') then
    create type public.fan_status as enum
      ('active', 'new', 'inactive', 'churn_risk', 'churned');
  end if;
  if not exists (select 1 from pg_type where typname = 'platform_type') then
    create type public.platform_type as enum
      ('telegram', 'fanvue', 'instagram', 'tiktok', 'threads', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'conversation_status') then
    create type public.conversation_status as enum ('open', 'waiting', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'sender_type') then
    create type public.sender_type as enum ('fan', 'mara', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'message_type') then
    create type public.message_type as enum ('text', 'image', 'video', 'ppv', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'message_status') then
    create type public.message_status as enum
      ('draft', 'awaiting_approval', 'approved', 'sent', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'content_type') then
    create type public.content_type as enum
      ('photo', 'video', 'reel', 'short', 'story', 'post', 'carousel', 'thread', 'message', 'ppv');
  end if;
  if not exists (select 1 from pg_type where typname = 'content_status') then
    create type public.content_status as enum
      ('idea', 'draft', 'ready', 'scheduled', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type public.asset_kind as enum ('image', 'video', 'audio', 'document', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'asset_category') then
    create type public.asset_category as enum
      ('portrait', 'lifestyle', 'fashion', 'gym', 'home', 'car', 'travel', 'story', 'ppv', 'private', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('pending', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'offer_type') then
    create type public.offer_type as enum
      ('subscription', 'ppv', 'bundle', 'vip', 'custom', 'telegram_vip');
  end if;
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type public.offer_status as enum ('draft', 'live', 'paused', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'purchase_status') then
    create type public.purchase_status as enum ('pending', 'paid', 'refunded', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('active', 'cancelled', 'expired', 'paused');
  end if;
  if not exists (select 1 from pg_type where typname = 'revenue_category') then
    create type public.revenue_category as enum
      ('subscription', 'ppv', 'tip', 'custom', 'affiliate', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type public.task_type as enum
      ('content', 'fan', 'sales', 'technical', 'analytics', 'marketing', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum
      ('todo', 'in_progress', 'waiting', 'done', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
  end if;
  if not exists (select 1 from pg_type where typname = 'run_status') then
    create type public.run_status as enum ('success', 'error', 'pending');
  end if;
  if not exists (select 1 from pg_type where typname = 'automation_trigger_type') then
    create type public.automation_trigger_type as enum
      ('schedule', 'event', 'condition', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'automation_status') then
    create type public.automation_status as enum ('active', 'paused', 'disabled');
  end if;
  if not exists (select 1 from pg_type where typname = 'episode_status') then
    create type public.episode_status as enum
      ('outline', 'in_production', 'scheduled', 'published', 'archived');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Персонаж: characters + character_traits
-- ----------------------------------------------------------------------------
create table if not exists public.characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text not null default '',
  age_display text not null default '',
  location    text not null default '',
  occupation  text not null default '',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists characters_user_slug_idx on public.characters (user_id, slug);

create table if not exists public.character_traits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  character_id       uuid not null references public.characters (id) on delete cascade,
  personality        jsonb not null default '[]',
  tone               text not null default '',
  interests          jsonb not null default '[]',
  dislikes           jsonb not null default '[]',
  speech_style       text not null default '',
  boundaries         jsonb not null default '[]',
  lore               text not null default '',
  backstory          text not null default '',
  recurring_objects  jsonb not null default '[]',
  story_rules        jsonb not null default '[]',
  public_persona     text not null default '',
  private_persona    text not null default '',
  relationship_rules jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists character_traits_character_idx on public.character_traits (character_id);

-- ----------------------------------------------------------------------------
-- 3. CRM: fans, fan_memories, conversations, messages
-- ----------------------------------------------------------------------------
create table if not exists public.fans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  character_id        uuid references public.characters (id) on delete set null,
  display_name        text not null,
  username            text not null default '',
  email               text,
  telegram_user_id    bigint,
  source              text not null default 'manual',
  status              public.fan_status not null default 'new',
  relationship_level  public.relationship_level not null default 'visitor',
  segments            text[] not null default '{}',
  lifetime_value      numeric(12, 2) not null default 0 check (lifetime_value >= 0),
  total_purchases     integer not null default 0 check (total_purchases >= 0),
  last_interaction_at timestamptz,
  location            text not null default '',
  joined_at           timestamptz not null default now(),
  notes               text not null default '',
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists fans_user_idx on public.fans (user_id, status);
create index if not exists fans_user_relationship_idx on public.fans (user_id, relationship_level);
create index if not exists fans_telegram_idx on public.fans (user_id, telegram_user_id) where telegram_user_id is not null;

create table if not exists public.fan_memories (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  fan_id            uuid not null references public.fans (id) on delete cascade,
  memory            text not null,
  category          text not null default 'personal',
  importance        numeric(3, 2) not null default 0.5 check (importance >= 0 and importance <= 1),
  source_message_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fan_memories_fan_idx on public.fan_memories (fan_id, importance desc);

create table if not exists public.conversations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  character_id            uuid references public.characters (id) on delete set null,
  fan_id                  uuid not null references public.fans (id) on delete cascade,
  platform                public.platform_type not null default 'manual',
  subject                 text not null default '',
  status                  public.conversation_status not null default 'open',
  unread_count            integer not null default 0 check (unread_count >= 0),
  awaiting_approval_count integer not null default 0 check (awaiting_approval_count >= 0),
  pinned                  boolean not null default false,
  last_message_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations (user_id, last_message_at desc nulls last);
create index if not exists conversations_fan_idx on public.conversations (fan_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_type     public.sender_type not null,
  sender_id       uuid,
  content         text not null default '',
  platform        public.platform_type not null default 'manual',
  message_type    public.message_type not null default 'text',
  status          public.message_status not null default 'sent',
  ai_generated    boolean not null default false,
  approved        boolean not null default false,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. Контент: content, episodes, assets, content_performance
-- ----------------------------------------------------------------------------
create table if not exists public.episodes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  number       integer not null,
  title        text not null,
  summary      text not null default '',
  status       public.episode_status not null default 'outline',
  start_date   date,
  end_date     date,
  key_events   jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists episodes_user_number_idx on public.episodes (user_id, number);

create table if not exists public.content (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  episode_id   uuid references public.episodes (id) on delete set null,
  title        text not null,
  description  text not null default '',
  content_type public.content_type not null default 'post',
  platform     public.platform_type not null default 'instagram',
  status       public.content_status not null default 'idea',
  caption      text not null default '',
  hook         text not null default '',
  script       text not null default '',
  cta          text not null default '',
  asset_ids    uuid[] not null default '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists content_user_idx on public.content (user_id, status);
create index if not exists content_episode_idx on public.content (episode_id) where episode_id is not null;

create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  character_id  uuid references public.characters (id) on delete set null,
  kind          public.asset_kind not null default 'image',
  category      public.asset_category not null default 'other',
  title         text not null,
  description   text not null default '',
  storage_path  text,
  url           text,
  thumbnail_url text,
  prompt        text not null default '',
  model         text not null default '',
  tags          text[] not null default '{}',
  approval      public.approval_status not null default 'pending',
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists assets_user_idx on public.assets (user_id, category);
create index if not exists assets_tags_idx on public.assets using gin (tags);

create table if not exists public.content_performance (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  content_id     uuid not null references public.content (id) on delete cascade,
  platform       public.platform_type not null,
  views          integer not null default 0,
  likes          integer not null default 0,
  comments       integer not null default 0,
  shares         integer not null default 0,
  saves          integer not null default 0,
  clicks         integer not null default 0,
  profile_visits integer not null default 0,
  conversions    integer not null default 0,
  revenue        numeric(12, 2) not null default 0,
  measured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists content_performance_content_idx on public.content_performance (content_id, measured_at desc);

-- ----------------------------------------------------------------------------
-- 5. Монетизация: offers, purchases, subscriptions, revenue_events
-- ----------------------------------------------------------------------------
create table if not exists public.offers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  name         text not null,
  description  text not null default '',
  price        numeric(12, 2) not null check (price >= 0),
  currency     text not null default 'USD',
  type         public.offer_type not null,
  status       public.offer_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  fan_id       uuid not null references public.fans (id) on delete cascade,
  offer_id     uuid references public.offers (id) on delete set null,
  amount       numeric(12, 2) not null check (amount >= 0),
  currency     text not null default 'USD',
  platform     public.platform_type not null default 'manual',
  status       public.purchase_status not null default 'paid',
  purchased_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases (user_id, purchased_at desc);
create index if not exists purchases_fan_idx on public.purchases (fan_id);

create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  fan_id       uuid not null references public.fans (id) on delete cascade,
  offer_id     uuid references public.offers (id) on delete set null,
  platform     public.platform_type not null default 'fanvue',
  status       public.subscription_status not null default 'active',
  started_at   timestamptz not null default now(),
  expires_at   timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);
create index if not exists subscriptions_fan_idx on public.subscriptions (fan_id);

create table if not exists public.revenue_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  fan_id       uuid references public.fans (id) on delete set null,
  offer_id     uuid references public.offers (id) on delete set null,
  category     public.revenue_category not null,
  amount       numeric(12, 2) not null,
  currency     text not null default 'USD',
  platform     public.platform_type,
  purchase_id  uuid references public.purchases (id) on delete set null,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists revenue_events_user_idx on public.revenue_events (user_id, occurred_at desc);
create index if not exists revenue_events_category_idx on public.revenue_events (user_id, category, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 6. Операции: tasks, ai_runs, ai_insights, automations, automation_runs, events
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  detail     text not null default '',
  type       public.task_type not null default 'admin',
  status     public.task_status not null default 'todo',
  priority   public.task_priority not null default 'medium',
  due_date   date,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks (user_id, status, priority);

create table if not exists public.ai_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  agent       text not null,
  input       jsonb not null default '{}',
  output      jsonb not null default '{}',
  status      public.run_status not null default 'success',
  model       text not null default 'mock',
  tokens      integer,
  duration_ms integer,
  created_at  timestamptz not null default now()
);
create index if not exists ai_runs_user_idx on public.ai_runs (user_id, created_at desc);

create table if not exists public.ai_insights (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null default 'insight' check (kind in ('insight', 'recommendation', 'risk')),
  title          text not null,
  body           text not null default '',
  recommendation text not null default '',
  confidence     numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status         text not null default 'new',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ai_insights_user_idx on public.ai_insights (user_id, created_at desc);

create table if not exists public.automations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  name           text not null,
  description    text not null default '',
  trigger_type   public.automation_trigger_type not null default 'manual',
  trigger_config jsonb not null default '{}',
  action_type    text not null default '',
  action_config  jsonb not null default '{}',
  status         public.automation_status not null default 'paused',
  -- feature flag / kill switch: автоматизация не выполняется, пока enabled = false
  enabled        boolean not null default false,
  last_run_at    timestamptz,
  next_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  status        public.run_status not null default 'success',
  detail        jsonb not null default '{}',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists automation_runs_idx on public.automation_runs (automation_id, created_at desc);

-- Единый журнал событий: воронка, атрибуция, аналитика
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  entity_type text,
  entity_id   uuid,
  platform    text,
  payload     jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists events_user_type_idx on public.events (user_id, type, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 7. Привязка Telegram (то же, что supabase/telegram.sql — идемпотентно)
-- ----------------------------------------------------------------------------
create table if not exists public.telegram_link_codes (
  code_hash        text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  telegram_chat_id bigint not null,
  telegram_user_id bigint not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  used_at          timestamptz
);
create index if not exists telegram_link_codes_chat_idx
  on public.telegram_link_codes (telegram_chat_id, created_at desc);

create table if not exists public.telegram_links (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  telegram_chat_id bigint not null unique,
  telegram_user_id bigint not null,
  linked_at        timestamptz not null default now()
);
create index if not exists telegram_links_chat_idx
  on public.telegram_links (telegram_chat_id);

create or replace function public.link_telegram_account(
  p_code_hash text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id bigint;
  v_telegram_user_id bigint;
begin
  select c.telegram_chat_id, c.telegram_user_id
    into v_chat_id, v_telegram_user_id
    from public.telegram_link_codes as c
   where c.code_hash = p_code_hash
     and c.used_at is null
     and c.expires_at > now()
   for update;

  if not found then
    return false;
  end if;

  -- Один Telegram-чат не может читать два разных аккаунта сайта.
  if exists (
    select 1
      from public.telegram_links as l
     where l.telegram_chat_id = v_chat_id
       and l.user_id <> p_user_id
  ) then
    return false;
  end if;

  update public.telegram_link_codes
     set used_at = now()
   where code_hash = p_code_hash;

  insert into public.telegram_links (user_id, telegram_chat_id, telegram_user_id, linked_at)
  values (p_user_id, v_chat_id, v_telegram_user_id, now())
  on conflict (user_id) do update
    set telegram_chat_id = excluded.telegram_chat_id,
        telegram_user_id = excluded.telegram_user_id,
        linked_at = now();

  return true;
end;
$$;

revoke all on function public.link_telegram_account(text, uuid) from public, anon, authenticated;
grant execute on function public.link_telegram_account(text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 8. updated_at триггеры
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'characters', 'character_traits', 'fans', 'fan_memories', 'conversations',
    'content', 'episodes', 'assets', 'offers', 'subscriptions',
    'tasks', 'ai_insights', 'automations'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- Row Level Security: владелец кабинета видит и изменяет только свои данные
-- ============================================================================

alter table public.profiles             enable row level security;
alter table public.characters           enable row level security;
alter table public.character_traits     enable row level security;
alter table public.fans                 enable row level security;
alter table public.fan_memories         enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.episodes             enable row level security;
alter table public.content              enable row level security;
alter table public.assets               enable row level security;
alter table public.content_performance  enable row level security;
alter table public.offers               enable row level security;
alter table public.purchases            enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.revenue_events       enable row level security;
alter table public.tasks                enable row level security;
alter table public.ai_runs              enable row level security;
alter table public.ai_insights          enable row level security;
alter table public.automations          enable row level security;
alter table public.automation_runs      enable row level security;
alter table public.events               enable row level security;
alter table public.telegram_link_codes  enable row level security;
alter table public.telegram_links       enable row level security;

-- profiles
drop policy if exists "profiles: own row read"   on public.profiles;
drop policy if exists "profiles: own row insert" on public.profiles;
drop policy if exists "profiles: own row update" on public.profiles;
create policy "profiles: own row read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own row insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: own row update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Однотипные политики владельца для всех таблиц предметной области
do $$
declare
  t text;
begin
  foreach t in array array[
    'characters', 'character_traits', 'fans', 'fan_memories', 'conversations',
    'messages', 'episodes', 'content', 'assets', 'content_performance',
    'offers', 'purchases', 'subscriptions', 'revenue_events',
    'tasks', 'ai_runs', 'ai_insights', 'automations', 'automation_runs', 'events'
  ] loop
    execute format('drop policy if exists "%s: own rows read"   on public.%I', t, t);
    execute format('drop policy if exists "%s: own rows insert" on public.%I', t, t);
    execute format('drop policy if exists "%s: own rows update" on public.%I', t, t);
    execute format('drop policy if exists "%s: own rows delete" on public.%I', t, t);
    execute format('create policy "%s: own rows read"   on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s: own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s: own rows update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s: own rows delete" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- Таблицы привязки Telegram: политик для anon/authenticated не даём намеренно.
-- Их читает только сервер бота под service-role ключом.
grant all on table public.telegram_link_codes to service_role;
grant all on table public.telegram_links to service_role;
