-- Cashlog Supabase schema
-- Run in Supabase SQL Editor after enabling Auth.

create table if not exists public.cashlog_entries (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date_time timestamptz not null,
  amount integer not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income')),
  category text not null,
  title text not null,
  memo text not null default '',
  source text not null check (source in ('photo', 'manual')),
  image_url text,
  video_url text,
  analysis jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists cashlog_entries_user_date_idx
  on public.cashlog_entries (user_id, date_time desc);

alter table public.cashlog_entries enable row level security;

drop policy if exists "cashlog entries are private" on public.cashlog_entries;
create policy "cashlog entries are private"
  on public.cashlog_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional future table for durable media storage metadata.
create table if not exists public.cashlog_media (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  thumbnail_path text,
  created_at timestamptz not null default now()
);

alter table public.cashlog_media enable row level security;

drop policy if exists "cashlog media are private" on public.cashlog_media;
create policy "cashlog media are private"
  on public.cashlog_media
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

