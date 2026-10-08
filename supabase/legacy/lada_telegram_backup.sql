-- ============================================================================
-- LADA Telegram Assistant — secure account linking
--
-- Apply this migration in Supabase SQL Editor after supabase/schema.sql.
-- The browser never reads these tables. The bot server uses the service-role
-- key; RLS is enabled with no user-facing policies.
-- ============================================================================

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

alter table public.telegram_link_codes enable row level security;
alter table public.telegram_links enable row level security;

-- Intentionally no policies for anon/authenticated. Only the server's
-- SUPABASE_SERVICE_ROLE_KEY may query these tables.
grant all on table public.telegram_link_codes to service_role;
grant all on table public.telegram_links to service_role;

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

  -- A Telegram chat may not read two different site accounts.
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
