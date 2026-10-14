-- Lista update: lets you pick an emoji for each item. Run once in Supabase → SQL Editor.
alter table public.items add column if not exists emoji text;
