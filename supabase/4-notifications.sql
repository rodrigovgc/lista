-- Lista update: phones that want notifications. Run once in Supabase → SQL Editor.
create table if not exists public.push_subs (
  endpoint   text primary key,
  device     text not null,
  name       text not null default '',
  sub        jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "lista_push_open" on public.push_subs;
create policy "lista_push_open" on public.push_subs for all to anon using (true) with check (true);
