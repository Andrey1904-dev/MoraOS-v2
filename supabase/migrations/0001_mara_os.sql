-- ============================================================================
-- Миграция 0001 — LADA Кредит & Гараж → Mara OS
--
-- Для существующего Supabase-проекта со старой автомобильной схемой.
--
-- ПОРЯДОК ПРИМЕНЕНИЯ (Supabase Dashboard → SQL Editor):
--   Шаг 1. Выполнить ЭТОТ файл целиком (Run).
--   Шаг 2. Выполнить supabase/schema.sql целиком (он идемпотентен:
--          создаёт только отсутствующие объекты).
--   Шаг 3. (Опционально) supabase/storage.sql и supabase/seed/mara_seed.sql.
--
-- Что делает этот файл:
--   • АРХИВИРУЕТ старые таблицы предметной области (cars, loans,
--     transactions, maintenance), переименовывая их в legacy_*. Данные
--     остаются в базе — ничего не удаляется и не дропается.
--   • RLS на legacy-таблицах сохраняется: владелец по-прежнему видит только
--     свои строки, прочитать их можно прямым SELECT при необходимости.
--   • Привязка Telegram (telegram_links, telegram_link_codes,
--     link_telegram_account) НЕ трогается — продолжает работать как раньше.
--
-- Идемпотентно: повторный запуск безопасен (шаги с IF EXISTS).
-- Бэкап прежних скриптов: supabase/legacy/.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cars') then
    alter table public.cars rename to legacy_cars;
    alter table public.legacy_cars rename constraint cars_pkey to legacy_cars_pkey;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'loans') then
    alter table public.loans rename to legacy_loans;
    alter table public.legacy_loans rename constraint loans_pkey to legacy_loans_pkey;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transactions') then
    alter table public.transactions rename to legacy_transactions;
    alter table public.legacy_transactions rename constraint transactions_pkey to legacy_transactions_pkey;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maintenance') then
    alter table public.maintenance rename to legacy_maintenance;
    alter table public.legacy_maintenance rename constraint maintenance_pkey to legacy_maintenance_pkey;
  end if;
end $$;

-- Старый enum transaction_category остаётся — он нужен архивной таблице
-- legacy_transactions. Новая схема его не использует.

-- Дальше: supabase/schema.sql (шаг 2).
