-- ============================================================================
-- Миграция 0001 — переход со старой автомобильной схемы на Mara OS
--
-- Нужна только для проекта, где уже применяли прежнюю (автомобильную) схему.
-- На пустом проекте этот файл ничего не меняет.
--
-- ПОРЯДОК ПРИМЕНЕНИЯ (Supabase Dashboard → SQL Editor):
--   Шаг 1. Выполнить ЭТОТ файл целиком (Run).
--   Шаг 2. Выполнить 0002_mara_os_schema.sql, затем 0003_mara_os_storage.sql,
--          затем 0004_telegram_rate_limit.sql (все идемпотентны).
--   Шаг 3. (Опционально) supabase/seed/mara_seed.sql — демо-данные, вручную.
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
-- Прежние скрипты — в истории git (коммит 086937e и ранее).
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

-- Дальше: 0002_mara_os_schema.sql (шаг 2).
