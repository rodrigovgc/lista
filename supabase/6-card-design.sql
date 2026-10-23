-- Lista update: card color and logo for the wallet. Run once in Supabase → SQL Editor.
alter table public.cards add column if not exists color text;
alter table public.cards add column if not exists logo text;
