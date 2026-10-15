-- Lista update: shared settings (the aisle order). Run once in Supabase → SQL Editor.
create table if not exists public.settings (
  id    text primary key,
  value jsonb
);
alter table public.settings enable row level security;
drop policy if exists "lista_settings_open" on public.settings;
create policy "lista_settings_open" on public.settings for all to anon using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.settings;
exception when duplicate_object then null; end $$;
