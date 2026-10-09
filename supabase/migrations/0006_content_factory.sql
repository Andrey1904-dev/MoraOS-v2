-- ============================================================================
-- Миграция 0006 — Content Factory: хранение этапов генерации контента
--
-- Добавляет таблицу content_generation_steps для отслеживания этапов
-- конвейера генерации контента (Brief → Ideas → Hooks → Script →
-- Platform Variants → Captions → Character Check → Quality Check → Draft).
--
-- Также расширяет таблицу content дополнительными полями для связи
-- с генерацией.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Типы для Content Factory
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pipeline_step') then
    create type public.pipeline_step as enum (
      'brief', 'ideas', 'hooks', 'script', 'platform_variants',
      'captions', 'character_check', 'quality_check', 'draft', 'approved'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'pipeline_status') then
    create type public.pipeline_status as enum (
      'pending', 'running', 'completed', 'failed', 'waiting_approval'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'check_severity') then
    create type public.check_severity as enum ('error', 'warning', 'info');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Таблица этапов генерации контента
-- ----------------------------------------------------------------------------
create table if not exists public.content_generation_steps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  pipeline_id     text not null,
  step            public.pipeline_step not null,
  status          public.pipeline_status not null default 'pending',
  -- Входные данные этапа (brief для первого, параметры для остальных)
  input_data      jsonb not null default '{}',
  -- Результат этапа (идеи, хуки, скрипт и т.д.)
  output_data     jsonb not null default '{}',
  -- Ошибка, если этап не прошёл
  error_message   text,
  -- Модель и метаданные AI-запуска
  ai_model        text,
  ai_duration_ms  integer,
  ai_tokens       integer,
  -- Связь с ai_runs
  ai_run_id       uuid references public.ai_runs (id) on delete set null,
  -- Связь с контентом (после сохранения черновика)
  content_id      uuid references public.content (id) on delete set null,
  -- Связь с эпизодом
  episode_id      uuid references public.episodes (id) on delete set null,
  -- Проверки
  check_passed    boolean,
  check_score     integer check (check_score is null or (check_score >= 0 and check_score <= 100)),
  check_issues    jsonb not null default '[]',
  -- Retry tracking
  retry_count     integer not null default 0,
  max_retries     integer not null default 3,
  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Индексы для основных запросов
create index if not exists content_generation_steps_user_idx
  on public.content_generation_steps (user_id, created_at desc);
create index if not exists content_generation_steps_pipeline_idx
  on public.content_generation_steps (pipeline_id, step);
create index if not exists content_generation_steps_content_idx
  on public.content_generation_steps (content_id) where content_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Расширение таблицы content для Content Factory
-- ----------------------------------------------------------------------------
-- Добавляем колонки если их ещё нет (идемпотентно)
alter table public.content
  add column if not exists generation_pipeline_id text,
  add column if not exists generation_brief jsonb,
  add column if not exists character_check_score integer check (character_check_score is null or (character_check_score >= 0 and character_check_score <= 100)),
  add column if not exists quality_check_score integer check (quality_check_score is null or (quality_check_score >= 0 and quality_check_score <= 100)),
  add column if not exists check_passed boolean;

-- ----------------------------------------------------------------------------
-- 4. RLS для content_generation_steps
-- ----------------------------------------------------------------------------
alter table public.content_generation_steps enable row level security;

drop policy if exists "content_generation_steps: own rows read"   on public.content_generation_steps;
drop policy if exists "content_generation_steps: own rows insert" on public.content_generation_steps;
drop policy if exists "content_generation_steps: own rows update" on public.content_generation_steps;
drop policy if exists "content_generation_steps: own rows delete" on public.content_generation_steps;

create policy "content_generation_steps: own rows read"
  on public.content_generation_steps for select
  using (auth.uid() = user_id);

create policy "content_generation_steps: own rows insert"
  on public.content_generation_steps for insert
  with check (auth.uid() = user_id);

create policy "content_generation_steps: own rows update"
  on public.content_generation_steps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "content_generation_steps: own rows delete"
  on public.content_generation_steps for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Grant для service_role (Edge Function ai-generate пишет сюда напрямую)
-- ----------------------------------------------------------------------------
grant all on table public.content_generation_steps to service_role;

-- ----------------------------------------------------------------------------
-- 6. updated_at триггер
-- ----------------------------------------------------------------------------
drop trigger if exists content_generation_steps_set_updated_at on public.content_generation_steps;
create trigger content_generation_steps_set_updated_at
  before update on public.content_generation_steps
  for each row execute function public.set_updated_at();
