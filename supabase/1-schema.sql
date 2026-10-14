-- Lista: run this once in Supabase → SQL Editor → New query → Run.

create table if not exists public.items (
  id        text primary key,
  name      text not null,
  cat       text not null default 'Outros',
  state     text not null default 'catalog' check (state in ('catalog','list','cart','next')),
  count     integer not null default 0,
  last_at   bigint  not null default 0,
  added_at  bigint  not null default 0,
  cart_at   bigint  not null default 0
);

create table if not exists public.cards (
  id       text primary key,
  name     text not null,
  code     text not null,
  format   text not null default 'CODE128',
  display  text not null default '',
  photo    text,
  sort     integer not null default 99
);

-- No accounts: anyone who has the app's link can read and edit the list.
alter table public.items enable row level security;
alter table public.cards enable row level security;
drop policy if exists "lista_items_open" on public.items;
drop policy if exists "lista_cards_open" on public.cards;
create policy "lista_items_open" on public.items for all to anon using (true) with check (true);
create policy "lista_cards_open" on public.cards for all to anon using (true) with check (true);

-- Live updates between the two phones.
alter publication supabase_realtime add table public.items, public.cards;
