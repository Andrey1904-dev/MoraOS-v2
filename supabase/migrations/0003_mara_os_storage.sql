-- ============================================================================
-- Mara OS — Supabase Storage: бакеты и политики доступа
--
-- Миграция 0003. Применять ПОСЛЕ 0002 (Dashboard → SQL Editor → Run).
--
-- Модель доступа: все бакеты приватные. Владелец кладёт файлы в папку
-- вида `<user_id>/...` и читает/меняет только свою папку. Приватный контент
-- (ppv/private-ассеты) никогда не становится публичным — выдача только через
-- подписанные URL.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('mara-assets', 'mara-assets', false),
  ('content', 'content', false),
  ('avatars', 'avatars', false),
  ('thumbnails', 'thumbnails', false),
  ('private', 'private', false)
on conflict (id) do nothing;

-- Первая часть пути обязана быть auth.uid() владельца.
create or replace function public.storage_owner_folder(name text)
returns boolean
language sql
stable
as $$
  select coalesce((storage.foldername(name))[1] = auth.uid()::text, false);
$$;

do $$
declare
  b text;
  kinds text[] := array['select', 'insert', 'update', 'delete'];
begin
  foreach b in array array['mara-assets', 'content', 'avatars', 'thumbnails', 'private'] loop
    execute format('drop policy if exists "%s: owner read"   on storage.objects', b);
    execute format('drop policy if exists "%s: owner insert" on storage.objects', b);
    execute format('drop policy if exists "%s: owner update" on storage.objects', b);
    execute format('drop policy if exists "%s: owner delete" on storage.objects', b);
    execute format(
      'create policy "%s: owner read" on storage.objects for select to authenticated using (bucket_id = %L and public.storage_owner_folder(name))',
      b, b
    );
    execute format(
      'create policy "%s: owner insert" on storage.objects for insert to authenticated with check (bucket_id = %L and public.storage_owner_folder(name))',
      b, b
    );
    execute format(
      'create policy "%s: owner update" on storage.objects for update to authenticated using (bucket_id = %L and public.storage_owner_folder(name)) with check (bucket_id = %L and public.storage_owner_folder(name))',
      b, b, b
    );
    execute format(
      'create policy "%s: owner delete" on storage.objects for delete to authenticated using (bucket_id = %L and public.storage_owner_folder(name))',
      b, b
    );
  end loop;
end $$;
