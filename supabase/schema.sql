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

-- User-level pet profile so the selected cat/dog, breed, color, and outfit follow the account.
create table if not exists public.cashlog_pet_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  pet_state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cashlog_pet_profiles enable row level security;

drop policy if exists "cashlog pet profiles are private" on public.cashlog_pet_profiles;
create policy "cashlog pet profiles are private"
  on public.cashlog_pet_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Product-photo analysis artifacts from the B-plan pipeline.
create table if not exists public.cashlog_detected_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_id text references public.cashlog_entries(id) on delete cascade,
  item_name text not null,
  display_name text not null,
  predicted_category text not null,
  confidence double precision not null default 0,
  bbox jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cashlog_detected_items_expense_idx
  on public.cashlog_detected_items (expense_id);

alter table public.cashlog_detected_items enable row level security;

drop policy if exists "cashlog detected items are private" on public.cashlog_detected_items;
create policy "cashlog detected items are private"
  on public.cashlog_detected_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.cashlog_category_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_id text references public.cashlog_entries(id) on delete set null,
  model_category text not null,
  user_category text not null,
  confidence double precision,
  item_keyword text,
  created_at timestamptz not null default now()
);

create index if not exists cashlog_category_feedback_user_idx
  on public.cashlog_category_feedback (user_id, item_keyword);

alter table public.cashlog_category_feedback enable row level security;

drop policy if exists "cashlog category feedback is private" on public.cashlog_category_feedback;
create policy "cashlog category feedback is private"
  on public.cashlog_category_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.cashlog_user_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_keyword text not null,
  preferred_category text not null,
  count integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, item_keyword, preferred_category)
);

alter table public.cashlog_user_category_rules enable row level security;

drop policy if exists "cashlog user category rules are private" on public.cashlog_user_category_rules;
create policy "cashlog user category rules are private"
  on public.cashlog_user_category_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
