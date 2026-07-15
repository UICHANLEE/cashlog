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
  image_storage_path text,
  video_url text,
  analysis jsonb,
  taxonomy_version text not null default '13.33.1',
  analysis_status text check (analysis_status in ('provisional', 'final')),
  analysis_revision integer not null default 0,
  user_category_edited_at timestamptz,
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

-- Private media metadata. Binary files live in the private cashlog-media bucket.
create table if not exists public.cashlog_media (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_id text references public.cashlog_entries(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  thumbnail_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cashlog_media enable row level security;

drop policy if exists "cashlog media are private" on public.cashlog_media;
create policy "cashlog media are private"
  on public.cashlog_media
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Signup consent history. app_id keeps this isolated when the Auth project is shared.
create table if not exists public.cashlog_user_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_id text not null check (app_id = 'cashlog'),
  consent_version text not null,
  age_14_or_older boolean not null,
  privacy_consent boolean not null,
  photo_time_consent boolean not null,
  location_consent boolean not null default false,
  consented_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.cashlog_user_consents enable row level security;

drop policy if exists "cashlog users read own consents" on public.cashlog_user_consents;
create policy "cashlog users read own consents"
  on public.cashlog_user_consents
  for select
  using (auth.uid() = user_id);

drop policy if exists "cashlog users insert own consents" on public.cashlog_user_consents;
create policy "cashlog users insert own consents"
  on public.cashlog_user_consents
  for insert
  with check (auth.uid() = user_id and app_id = 'cashlog');

drop policy if exists "cashlog users update own consents" on public.cashlog_user_consents;
create policy "cashlog users update own consents"
  on public.cashlog_user_consents
  for update
  using (auth.uid() = user_id and app_id = 'cashlog')
  with check (auth.uid() = user_id and app_id = 'cashlog');

create or replace function public.capture_cashlog_signup_consents()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'app_id' = 'cashlog' then
    insert into public.cashlog_user_consents (
      user_id, app_id, consent_version, age_14_or_older, privacy_consent,
      photo_time_consent, location_consent, consented_at
    ) values (
      new.id,
      'cashlog',
      coalesce(new.raw_user_meta_data ->> 'consent_version', 'unknown'),
      coalesce((new.raw_user_meta_data ->> 'age_14_or_older')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'privacy_consent')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'photo_time_consent')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'location_consent')::boolean, false),
      coalesce((new.raw_user_meta_data ->> 'consented_at')::timestamptz, now())
    )
    on conflict (user_id) do update set
      consent_version = excluded.consent_version,
      age_14_or_older = excluded.age_14_or_older,
      privacy_consent = excluded.privacy_consent,
      photo_time_consent = excluded.photo_time_consent,
      location_consent = excluded.location_consent,
      consented_at = excluded.consented_at,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_cashlog_user_created on auth.users;
create trigger on_cashlog_user_created
  after insert on auth.users
  for each row execute procedure public.capture_cashlog_signup_consents();

-- Public launch reservations. Visitors may insert, but only project admins can read emails.
create table if not exists public.cashlog_reservations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 320),
  marketing_consent boolean not null check (marketing_consent = true),
  consent_version text not null,
  consented_at timestamptz not null,
  source text not null default 'reservation' check (source = 'reservation'),
  created_at timestamptz not null default now()
);

create unique index if not exists cashlog_reservations_email_unique
  on public.cashlog_reservations (lower(email));

alter table public.cashlog_reservations enable row level security;

drop policy if exists "cashlog visitors create reservations" on public.cashlog_reservations;
create policy "cashlog visitors create reservations"
  on public.cashlog_reservations
  for insert
  to anon, authenticated
  with check (marketing_consent = true and source = 'reservation');

grant insert on public.cashlog_reservations to anon, authenticated;

-- The bucket is private. A user can access only files under <auth.uid()>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cashlog-media',
  'cashlog-media',
  false,
  52428800,
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cashlog storage select own folder" on storage.objects;
create policy "cashlog storage select own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'cashlog-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cashlog storage insert own folder" on storage.objects;
create policy "cashlog storage insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cashlog-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cashlog storage update own folder" on storage.objects;
create policy "cashlog storage update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'cashlog-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cashlog-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cashlog storage delete own folder" on storage.objects;
create policy "cashlog storage delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cashlog-media' and (storage.foldername(name))[1] = auth.uid()::text);

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
  top3 jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  model_version text,
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
  reason_code text,
  session_id text,
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
  last_applied_at timestamptz,
  precision double precision,
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

-- Existing projects can safely re-run this file after upgrading the analysis contract.
alter table public.cashlog_entries add column if not exists taxonomy_version text not null default '13.33.1';
alter table public.cashlog_entries add column if not exists image_storage_path text;
alter table public.cashlog_entries add column if not exists analysis_status text;
alter table public.cashlog_entries add column if not exists analysis_revision integer not null default 0;
alter table public.cashlog_entries add column if not exists user_category_edited_at timestamptz;
alter table public.cashlog_detected_items add column if not exists top3 jsonb not null default '[]'::jsonb;
alter table public.cashlog_detected_items add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.cashlog_detected_items add column if not exists model_version text;
alter table public.cashlog_category_feedback add column if not exists reason_code text;
alter table public.cashlog_category_feedback add column if not exists session_id text;
alter table public.cashlog_user_category_rules add column if not exists last_applied_at timestamptz;
alter table public.cashlog_user_category_rules add column if not exists precision double precision;
alter table public.cashlog_media add column if not exists expense_id text references public.cashlog_entries(id) on delete cascade;
alter table public.cashlog_media add column if not exists original_filename text;
alter table public.cashlog_media add column if not exists mime_type text;
alter table public.cashlog_media add column if not exists size_bytes bigint;
alter table public.cashlog_media add column if not exists width integer;
alter table public.cashlog_media add column if not exists height integer;
alter table public.cashlog_media add column if not exists captured_at timestamptz;

-- Account profiles. Password hashes remain exclusively in Supabase Auth's protected auth schema.
create table if not exists public.cashlog_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nickname text not null check (char_length(nickname) between 2 and 30),
  profile_image_url text check (profile_image_url is null or profile_image_url like 'storage://cashlog-profiles/%'),
  profile_image_path text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists cashlog_profiles_email_unique
  on public.cashlog_profiles (lower(email));

alter table public.cashlog_profiles enable row level security;

drop policy if exists "cashlog users read own profile" on public.cashlog_profiles;
create policy "cashlog users read own profile"
  on public.cashlog_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "cashlog users update own profile" on public.cashlog_profiles;
create policy "cashlog users update own profile"
  on public.cashlog_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- OAuth users also receive a profile. Password signups are later enriched by the server API.
create or replace function public.capture_cashlog_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'app_id' = 'cashlog' then
    insert into public.cashlog_profiles (
      user_id, email, nickname, status, email_verified_at, created_at, updated_at
    ) values (
      new.id,
      lower(coalesce(new.email, '')),
      left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), 'Cashlogger'), 30),
      'ACTIVE',
      new.email_confirmed_at,
      new.created_at,
      now()
    )
    on conflict (user_id) do update set
      email = excluded.email,
      email_verified_at = excluded.email_verified_at,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_cashlog_profile_created on auth.users;
create trigger on_cashlog_profile_created
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute procedure public.capture_cashlog_profile();

-- Private, server-processed profile avatars. Clients only receive expiring signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cashlog-profiles', 'cashlog-profiles', false, 1048576, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cashlog users read own profile images" on storage.objects;
create policy "cashlog users read own profile images"
  on storage.objects for select to authenticated
  using (bucket_id = 'cashlog-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fixed-window API limiter. Only the service role can execute this function.
create table if not exists public.cashlog_auth_rate_limits (
  rate_key text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (rate_key, action)
);

alter table public.cashlog_auth_rate_limits enable row level security;

create or replace function public.cashlog_check_rate_limit(
  p_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_count integer;
begin
  insert into public.cashlog_auth_rate_limits (rate_key, action, window_started_at, request_count)
  values (p_key, p_action, now(), 1)
  on conflict (rate_key, action) do update set
    window_started_at = case
      when public.cashlog_auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else public.cashlog_auth_rate_limits.window_started_at
    end,
    request_count = case
      when public.cashlog_auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else public.cashlog_auth_rate_limits.request_count + 1
    end
  returning request_count into current_count;
  return current_count <= p_limit;
end;
$$;

revoke all on function public.cashlog_check_rate_limit(text, text, integer, integer) from public;
revoke all on function public.cashlog_check_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.cashlog_check_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.cashlog_check_rate_limit(text, text, integer, integer) to service_role;

-- Remove only Cashlog-owned data. The Auth identity may be shared by another app in this Supabase project.
create or replace function public.cashlog_delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.cashlog_category_feedback where user_id = p_user_id;
  delete from public.cashlog_user_category_rules where user_id = p_user_id;
  delete from public.cashlog_pet_profiles where user_id = p_user_id;
  delete from public.cashlog_entries where user_id = p_user_id;
  delete from public.cashlog_media where user_id = p_user_id;
  delete from public.cashlog_user_consents where user_id = p_user_id;
  update public.cashlog_profiles set
    email = p_user_id::text || '@deleted.cashlog.invalid',
    nickname = '탈퇴한 사용자',
    profile_image_url = null,
    profile_image_path = null,
    status = 'DELETED',
    deleted_at = now(),
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.cashlog_delete_account_data(uuid) from public;
revoke all on function public.cashlog_delete_account_data(uuid) from anon;
revoke all on function public.cashlog_delete_account_data(uuid) from authenticated;
grant execute on function public.cashlog_delete_account_data(uuid) to service_role;
