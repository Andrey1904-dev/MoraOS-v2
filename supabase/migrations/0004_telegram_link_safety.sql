-- ============================================================================
-- Миграция 0004 — безопасность привязки Telegram
--
-- 1. telegram_link_codes.telegram_display — имя аккаунта Telegram, с которого
--    запрошен код. Сайт показывает его ДО подтверждения («Подключить аккаунт
--    «Anna (@anna)»?»), чтобы фишинговый код нельзя было подтвердить вслепую.
-- 2. rate_limits + consume_rate_limit — общий счётчик попыток. Счётчик в памяти
--    функции не работает: у Edge Functions много экземпляров и нет общего состояния.
--
-- Идемпотентно. Порядок: 0001 → 0002 → 0003 → 0004.
-- ============================================================================

alter table public.telegram_link_codes
  add column if not exists telegram_display text not null default ''
    check (char_length(telegram_display) <= 80);

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0 check (hits >= 0)
);

-- Доступ только у сервера (service_role). Для anon и authenticated таблицы нет.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;
grant all on table public.rate_limits to service_role;

-- Фиксированное окно: атомарный upsert под блокировкой строки. Возвращает true,
-- пока число попыток в текущем окне не превысило p_limit.
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'consume_rate_limit: invalid arguments';
  end if;

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start
    end,
    hits = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
      else r.hits + 1
    end
  returning hits into v_hits;

  -- Уборка старых окон примерно в 1% вызовов, чтобы таблица не росла бесконечно.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
