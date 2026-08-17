-- Cashlog Supabase schema
-- Run in Supabase SQL Editor after enabling Auth.

create table if not exists public.cashlog_entries (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date_time timestamptz not null,
  local_date date,
  time_zone text,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  amount integer not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income')),
  category text not null,
  title text not null,
  memo text not null default '',
  mood_score smallint check (mood_score between 1 and 5),
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
  developer_message text check (developer_message is null or char_length(developer_message) <= 500),
  created_at timestamptz not null default now()
);

alter table public.cashlog_reservations
  add column if not exists developer_message text;

alter table public.cashlog_reservations
  drop constraint if exists cashlog_reservations_developer_message_check;
alter table public.cashlog_reservations
  add constraint cashlog_reservations_developer_message_check
  check (developer_message is null or char_length(developer_message) <= 500);

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
  schema_version smallint not null default 2,
  event_id uuid not null default gen_random_uuid() unique,
  sample_id uuid not null default gen_random_uuid(),
  expense_id text references public.cashlog_entries(id) on delete set null,
  request_id text,
  model_version text not null default 'unknown',
  taxonomy_version text not null default '13.33.1',
  model_category text not null,
  user_category text not null,
  confidence double precision,
  predicted_top3 jsonb not null default '[]'::jsonb,
  selected_leaf_id text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual_edit',
  image_retention_consent boolean not null default false,
  image_object_key text,
  review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  item_keyword text,
  reason_code text,
  session_id text,
  created_at timestamptz not null default now(),
  constraint cashlog_feedback_schema_version_check check (schema_version in (1, 2)),
  constraint cashlog_feedback_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint cashlog_feedback_top3_check check (jsonb_typeof(predicted_top3) = 'array' and jsonb_array_length(predicted_top3) <= 3),
  constraint cashlog_feedback_source_check check (source in ('accepted_prediction', 'top3_selection', 'manual_edit')),
  constraint cashlog_feedback_review_status_check check (review_status in ('pending', 'approved', 'rejected')),
  constraint cashlog_feedback_image_consent_check check (image_retention_consent or image_object_key is null)
);

-- Add the v2 event columns before indexes and RLS policies when upgrading an existing project.
alter table public.cashlog_category_feedback add column if not exists schema_version smallint;
alter table public.cashlog_category_feedback add column if not exists event_id uuid default gen_random_uuid();
alter table public.cashlog_category_feedback add column if not exists sample_id uuid default gen_random_uuid();
alter table public.cashlog_category_feedback add column if not exists request_id text;
alter table public.cashlog_category_feedback add column if not exists model_version text;
alter table public.cashlog_category_feedback add column if not exists taxonomy_version text;
alter table public.cashlog_category_feedback add column if not exists predicted_top3 jsonb;
alter table public.cashlog_category_feedback add column if not exists selected_leaf_id text;
alter table public.cashlog_category_feedback add column if not exists occurred_at timestamptz;
alter table public.cashlog_category_feedback add column if not exists source text;
alter table public.cashlog_category_feedback add column if not exists image_retention_consent boolean;
alter table public.cashlog_category_feedback add column if not exists image_object_key text;
alter table public.cashlog_category_feedback add column if not exists review_status text;
alter table public.cashlog_category_feedback add column if not exists reviewed_at timestamptz;
alter table public.cashlog_category_feedback add column if not exists reviewed_by uuid;

create index if not exists cashlog_category_feedback_user_idx
  on public.cashlog_category_feedback (user_id, item_keyword);
create unique index if not exists cashlog_category_feedback_event_idx
  on public.cashlog_category_feedback (event_id);
create index if not exists cashlog_category_feedback_review_idx
  on public.cashlog_category_feedback (review_status, selected_leaf_id, occurred_at);

alter table public.cashlog_category_feedback enable row level security;

drop policy if exists "cashlog category feedback is private" on public.cashlog_category_feedback;
drop policy if exists "cashlog users read own feedback" on public.cashlog_category_feedback;
drop policy if exists "cashlog users insert pending feedback" on public.cashlog_category_feedback;
drop policy if exists "cashlog users delete own feedback" on public.cashlog_category_feedback;
create policy "cashlog users read own feedback"
  on public.cashlog_category_feedback
  for select
  using (auth.uid() = user_id);
create policy "cashlog users insert pending feedback"
  on public.cashlog_category_feedback
  for insert
  with check (
    auth.uid() = user_id
    and review_status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and (
      image_object_key is null
      or image_object_key like (auth.uid()::text || '/%')
    )
  );
create policy "cashlog users delete own feedback"
  on public.cashlog_category_feedback
  for delete
  using (auth.uid() = user_id);

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
alter table public.cashlog_entries add column if not exists mood_score smallint check (mood_score between 1 and 5);
alter table public.cashlog_entries add column if not exists local_date date;
alter table public.cashlog_entries add column if not exists time_zone text;
alter table public.cashlog_entries add column if not exists latitude double precision;
alter table public.cashlog_entries add column if not exists longitude double precision;
alter table public.cashlog_entries add column if not exists location_accuracy_m double precision;
alter table public.cashlog_detected_items add column if not exists top3 jsonb not null default '[]'::jsonb;
alter table public.cashlog_detected_items add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.cashlog_detected_items add column if not exists model_version text;
alter table public.cashlog_category_feedback add column if not exists reason_code text;
alter table public.cashlog_category_feedback add column if not exists session_id text;
alter table public.cashlog_category_feedback add column if not exists schema_version smallint;
alter table public.cashlog_category_feedback add column if not exists event_id uuid default gen_random_uuid();
alter table public.cashlog_category_feedback add column if not exists sample_id uuid default gen_random_uuid();
alter table public.cashlog_category_feedback add column if not exists request_id text;
alter table public.cashlog_category_feedback add column if not exists model_version text;
alter table public.cashlog_category_feedback add column if not exists taxonomy_version text;
alter table public.cashlog_category_feedback add column if not exists predicted_top3 jsonb;
alter table public.cashlog_category_feedback add column if not exists selected_leaf_id text;
alter table public.cashlog_category_feedback add column if not exists occurred_at timestamptz;
alter table public.cashlog_category_feedback add column if not exists source text;
alter table public.cashlog_category_feedback add column if not exists image_retention_consent boolean;
alter table public.cashlog_category_feedback add column if not exists image_object_key text;
alter table public.cashlog_category_feedback add column if not exists review_status text;
alter table public.cashlog_category_feedback add column if not exists reviewed_at timestamptz;
alter table public.cashlog_category_feedback add column if not exists reviewed_by uuid;
update public.cashlog_category_feedback
set
  schema_version = coalesce(schema_version, 1),
  event_id = coalesce(event_id, gen_random_uuid()),
  sample_id = coalesce(sample_id, gen_random_uuid()),
  model_version = coalesce(model_version, 'legacy-unknown'),
  taxonomy_version = coalesce(taxonomy_version, '13.33.1'),
  predicted_top3 = coalesce(
    predicted_top3,
    jsonb_build_array(jsonb_build_object('category', model_category, 'confidence', coalesce(confidence, 0)))
  ),
  selected_leaf_id = coalesce(selected_leaf_id, user_category),
  occurred_at = coalesce(occurred_at, created_at),
  source = coalesce(source, 'manual_edit'),
  image_retention_consent = coalesce(image_retention_consent, false),
  review_status = coalesce(review_status, 'pending');
alter table public.cashlog_category_feedback alter column schema_version set default 2;
alter table public.cashlog_category_feedback alter column schema_version set not null;
alter table public.cashlog_category_feedback alter column event_id set default gen_random_uuid();
alter table public.cashlog_category_feedback alter column event_id set not null;
alter table public.cashlog_category_feedback alter column sample_id set default gen_random_uuid();
alter table public.cashlog_category_feedback alter column sample_id set not null;
alter table public.cashlog_category_feedback alter column model_version set default 'unknown';
alter table public.cashlog_category_feedback alter column model_version set not null;
alter table public.cashlog_category_feedback alter column taxonomy_version set default '13.33.1';
alter table public.cashlog_category_feedback alter column taxonomy_version set not null;
alter table public.cashlog_category_feedback alter column predicted_top3 set default '[]'::jsonb;
alter table public.cashlog_category_feedback alter column predicted_top3 set not null;
alter table public.cashlog_category_feedback alter column selected_leaf_id set not null;
alter table public.cashlog_category_feedback alter column occurred_at set default now();
alter table public.cashlog_category_feedback alter column occurred_at set not null;
alter table public.cashlog_category_feedback alter column source set default 'manual_edit';
alter table public.cashlog_category_feedback alter column source set not null;
alter table public.cashlog_category_feedback alter column image_retention_consent set default false;
alter table public.cashlog_category_feedback alter column image_retention_consent set not null;
alter table public.cashlog_category_feedback alter column review_status set default 'pending';
alter table public.cashlog_category_feedback alter column review_status set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_schema_version_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_schema_version_check
      check (schema_version in (1, 2)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_confidence_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 1)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_top3_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_top3_check
      check (jsonb_typeof(predicted_top3) = 'array' and jsonb_array_length(predicted_top3) <= 3) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_source_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_source_check
      check (source in ('accepted_prediction', 'top3_selection', 'manual_edit')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_review_status_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_review_status_check
      check (review_status in ('pending', 'approved', 'rejected')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cashlog_feedback_image_consent_check') then
    alter table public.cashlog_category_feedback add constraint cashlog_feedback_image_consent_check
      check (image_retention_consent or image_object_key is null) not valid;
  end if;
end
$$;
create unique index if not exists cashlog_category_feedback_event_idx
  on public.cashlog_category_feedback (event_id);
create index if not exists cashlog_category_feedback_review_idx
  on public.cashlog_category_feedback (review_status, selected_leaf_id, occurred_at);
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

-- Privacy-preserving product events. Raw IP, email, photos, amounts, titles, memos,
-- coordinates, and auth tokens are intentionally excluded.
create table if not exists public.cashlog_event_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_hash text not null check (char_length(session_hash) = 64),
  event_name text not null check (char_length(event_name) between 3 and 64),
  path text not null check (char_length(path) between 1 and 160),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists cashlog_event_logs_occurred_idx
  on public.cashlog_event_logs (occurred_at desc);
create index if not exists cashlog_event_logs_name_occurred_idx
  on public.cashlog_event_logs (event_name, occurred_at desc);
create index if not exists cashlog_event_logs_user_occurred_idx
  on public.cashlog_event_logs (user_id, occurred_at desc)
  where user_id is not null;
create index if not exists cashlog_event_logs_session_occurred_idx
  on public.cashlog_event_logs (session_hash, occurred_at desc);
create index if not exists cashlog_event_logs_behavior_view_idx
  on public.cashlog_event_logs (event_name, (properties->>'view_id'), occurred_at desc)
  where event_name in ('page_view', 'view_opened', 'page_duration', 'view_duration', 'first_action');
create index if not exists cashlog_event_logs_behavior_action_idx
  on public.cashlog_event_logs ((properties->>'action_id'), occurred_at desc)
  where event_name = 'action_clicked';

alter table public.cashlog_event_logs enable row level security;
revoke all on table public.cashlog_event_logs from anon, authenticated;
grant select, insert, delete on table public.cashlog_event_logs to service_role;

create or replace function public.cashlog_admin_event_summary()
returns jsonb
language sql
security definer set search_path = ''
stable
as $$
  with view_opens_7d as (
    select
      session_hash,
      path,
      coalesce(nullif(properties->>'scope', ''), case when event_name = 'page_view' then 'page' else 'view' end) as scope,
      coalesce(nullif(properties->>'view', ''), path) as view_name,
      properties->>'view_id' as view_id,
      min(occurred_at) as opened_at
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name in ('page_view', 'view_opened')
      and properties ? 'view_id'
    group by
      session_hash,
      path,
      coalesce(nullif(properties->>'scope', ''), case when event_name = 'page_view' then 'page' else 'view' end),
      coalesce(nullif(properties->>'view', ''), path),
      properties->>'view_id'
  ), dwell_7d as (
    select
      session_hash,
      path,
      coalesce(nullif(properties->>'scope', ''), case when event_name = 'page_duration' then 'page' else 'view' end) as scope,
      coalesce(nullif(properties->>'view', ''), path) as view_name,
      properties->>'view_id' as view_id,
      sum(case when properties->>'duration_ms' ~ '^[0-9]+$' then (properties->>'duration_ms')::numeric else 0 end) as dwell_ms,
      max(case when properties->>'scroll_depth_pct' ~ '^[0-9]+$' then (properties->>'scroll_depth_pct')::numeric else 0 end) as scroll_depth_pct,
      max(occurred_at) as last_at
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name in ('page_duration', 'view_duration')
      and properties ? 'view_id'
    group by
      session_hash,
      path,
      coalesce(nullif(properties->>'scope', ''), case when event_name = 'page_duration' then 'page' else 'view' end),
      coalesce(nullif(properties->>'view', ''), path),
      properties->>'view_id'
  ), first_actions_7d as (
    select distinct on (session_hash, properties->>'view_id')
      session_hash,
      properties->>'view_id' as view_id,
      case when properties->>'time_to_action_ms' ~ '^[0-9]+$' then (properties->>'time_to_action_ms')::numeric else null end as time_to_action_ms,
      occurred_at
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name = 'first_action'
      and properties ? 'view_id'
    order by session_hash, properties->>'view_id', occurred_at
  ), engagement_7d as (
    select
      opened.scope,
      opened.path,
      opened.view_name,
      count(*)::integer as views,
      count(dwell.view_id)::integer as completed_views,
      coalesce(round(avg(dwell.dwell_ms)), 0)::bigint as avg_dwell_ms,
      coalesce(round(avg(dwell.scroll_depth_pct)), 0)::integer as avg_scroll_depth_pct,
      coalesce(round(100.0 * count(first_action.view_id) / nullif(count(*), 0), 1), 0) as first_action_rate,
      coalesce(round(avg(first_action.time_to_action_ms)), 0)::bigint as avg_first_action_ms
    from view_opens_7d opened
    left join dwell_7d dwell on dwell.session_hash = opened.session_hash and dwell.view_id = opened.view_id
    left join first_actions_7d first_action on first_action.session_hash = opened.session_hash and first_action.view_id = opened.view_id
    group by opened.scope, opened.path, opened.view_name
  )
  select jsonb_build_object(
    'totalEvents', (select count(*) from public.cashlog_event_logs),
    'events24h', (
      select count(*) from public.cashlog_event_logs
      where occurred_at >= now() - interval '24 hours'
    ),
    'events7d', (
      select count(*) from public.cashlog_event_logs
      where occurred_at >= now() - interval '7 days'
    ),
    'activeSessions24h', (
      select count(distinct session_hash) from public.cashlog_event_logs
      where occurred_at >= now() - interval '24 hours'
    ),
    'signedInUsers7d', (
      select count(distinct user_id) from public.cashlog_event_logs
      where user_id is not null and occurred_at >= now() - interval '7 days'
    ),
    'clientErrors24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'client_error' and occurred_at >= now() - interval '24 hours'
    ),
    'avgDwellMs24h', coalesce((
      select round(avg(dwell_ms))::bigint from dwell_7d
      where last_at >= now() - interval '24 hours'
    ), 0),
    'engagedViews24h', (
      select count(*) from dwell_7d
      where last_at >= now() - interval '24 hours'
    ),
    'avgFirstActionMs24h', coalesce((
      select round(avg(time_to_action_ms))::bigint from first_actions_7d
      where occurred_at >= now() - interval '24 hours'
    ), 0),
    'actionClicks24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'action_clicked' and occurred_at >= now() - interval '24 hours'
    ),
    'topEvents7d', coalesce((
      select jsonb_agg(to_jsonb(event_totals))
      from (
        select event_name as name, count(*) as count
        from public.cashlog_event_logs
        where occurred_at >= now() - interval '7 days'
        group by event_name
        order by count(*) desc, event_name
        limit 8
      ) event_totals
    ), '[]'::jsonb),
    'topPaths7d', coalesce((
      select jsonb_agg(to_jsonb(path_totals))
      from (
        select path, count(*) as count
        from public.cashlog_event_logs
        where occurred_at >= now() - interval '7 days'
        group by path
        order by count(*) desc, path
        limit 8
      ) path_totals
    ), '[]'::jsonb),
    'engagement7d', coalesce((
      select jsonb_agg(to_jsonb(engagement_rows))
      from (
        select
          scope,
          path,
          view_name as view,
          views,
          completed_views as "completedViews",
          avg_dwell_ms as "avgDwellMs",
          avg_scroll_depth_pct as "avgScrollDepthPct",
          first_action_rate as "firstActionRate",
          avg_first_action_ms as "avgFirstActionMs"
        from engagement_7d
        order by views desc, path, view_name
        limit 12
      ) engagement_rows
    ), '[]'::jsonb),
    'topActions7d', coalesce((
      select jsonb_agg(to_jsonb(action_rows))
      from (
        select
          properties->>'action_id' as "actionId",
          count(*) as count,
          coalesce(round(avg(case
            when properties->>'time_to_action_ms' ~ '^[0-9]+$' then (properties->>'time_to_action_ms')::numeric
            else null
          end)), 0)::bigint as "avgTimeToActionMs"
        from public.cashlog_event_logs
        where event_name = 'action_clicked'
          and occurred_at >= now() - interval '7 days'
          and properties ? 'action_id'
        group by properties->>'action_id'
        order by count(*) desc, properties->>'action_id'
        limit 12
      ) action_rows
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.cashlog_admin_event_summary() from public, anon, authenticated;
grant execute on function public.cashlog_admin_event_summary() to service_role;

create or replace function public.cashlog_prune_event_logs(p_days integer default 90)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.cashlog_event_logs
  where received_at < now() - make_interval(days => greatest(7, least(p_days, 365)));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cashlog_prune_event_logs(integer) from public, anon, authenticated;
grant execute on function public.cashlog_prune_event_logs(integer) to service_role;


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
  delete from public.cashlog_event_logs where user_id = p_user_id;
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
