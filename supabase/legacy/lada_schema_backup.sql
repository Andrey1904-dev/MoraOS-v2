-- ============================================================================
-- LADA Кредит & Гараж — схема БД Supabase (PostgreSQL) + Row Level Security
--
-- Применение: Supabase Dashboard → SQL Editor → вставить весь скрипт → Run
-- (или `supabase db push` при работе через Supabase CLI).
-- ============================================================================

-- Тип-перечисление категорий расходов
create type public.transaction_category as enum
  ('fuel', 'loan', 'maintenance', 'insurance', 'other');

-- ----------------------------------------------------------------------------
-- 1. profiles — профиль пользователя, связанный с Supabase Auth
-- ----------------------------------------------------------------------------
create table public.profiles (
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
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. cars — автомобиль пользователя
-- ----------------------------------------------------------------------------
create table public.cars (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  plate_number     text not null default '',
  vin_number       text not null default '',
  current_mileage  integer not null default 0 check (current_mileage >= 0),
  -- пробег на момент начала учёта (нужен для расчёта стоимости километра)
  initial_mileage  integer not null default 0 check (initial_mileage >= 0),
  -- дата окончания полиса ОСАГО (для напоминания, <14 дней — индикатор)
  insurance_until  date,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. loans — автокредит
-- ----------------------------------------------------------------------------
create table public.loans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  total_amount    numeric(14, 2) not null check (total_amount > 0),
  interest_rate   numeric(6, 3)  not null check (interest_rate >= 0),
  monthly_payment numeric(14, 2) not null check (monthly_payment > 0),
  term_months     integer not null check (term_months > 0),
  start_date      date not null,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. transactions — расходы
-- ----------------------------------------------------------------------------
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  amount                 numeric(14, 2) not null check (amount >= 0),
  category               public.transaction_category not null,
  date                   timestamptz not null default now(),
  -- пробег на момент операции (обязателен для топлива на уровне приложения)
  mileage_at_transaction integer check (mileage_at_transaction is null or mileage_at_transaction >= 0),
  created_at             timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);

-- ----------------------------------------------------------------------------
-- 5. maintenance — журнал ТО и ремонтов
-- ----------------------------------------------------------------------------
create table public.maintenance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  date        date not null default current_date,
  mileage     integer not null default 0 check (mileage >= 0),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create index maintenance_user_date_idx on public.maintenance (user_id, date desc);

-- ============================================================================
-- Row Level Security: каждый пользователь видит и изменяет только свои данные
-- ============================================================================

alter table public.profiles     enable row level security;
alter table public.cars         enable row level security;
alter table public.loans        enable row level security;
alter table public.transactions enable row level security;
alter table public.maintenance  enable row level security;

-- profiles
create policy "profiles: own row read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own row insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: own row update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- cars
create policy "cars: own rows read"   on public.cars for select using (auth.uid() = user_id);
create policy "cars: own rows insert" on public.cars for insert with check (auth.uid() = user_id);
create policy "cars: own rows update" on public.cars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cars: own rows delete" on public.cars for delete using (auth.uid() = user_id);

-- loans
create policy "loans: own rows read"   on public.loans for select using (auth.uid() = user_id);
create policy "loans: own rows insert" on public.loans for insert with check (auth.uid() = user_id);
create policy "loans: own rows update" on public.loans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loans: own rows delete" on public.loans for delete using (auth.uid() = user_id);

-- transactions
create policy "transactions: own rows read"   on public.transactions for select using (auth.uid() = user_id);
create policy "transactions: own rows insert" on public.transactions for insert with check (auth.uid() = user_id);
create policy "transactions: own rows update" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions: own rows delete" on public.transactions for delete using (auth.uid() = user_id);

-- maintenance
create policy "maintenance: own rows read"   on public.maintenance for select using (auth.uid() = user_id);
create policy "maintenance: own rows insert" on public.maintenance for insert with check (auth.uid() = user_id);
create policy "maintenance: own rows update" on public.maintenance for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "maintenance: own rows delete" on public.maintenance for delete using (auth.uid() = user_id);

-- ============================================================================
-- Backfill: если вы зарегистрировали аккаунт ДО применения этого скрипта,
-- триггер handle_new_user по нему не отработал — создаём профили вручную
-- для всех уже существующих пользователей.
-- ============================================================================
insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
on conflict (id) do nothing;
