begin;

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

alter table public.cashlog_category_feedback enable row level security;
drop policy if exists "cashlog category feedback is private" on public.cashlog_category_feedback;
drop policy if exists "cashlog users read own feedback" on public.cashlog_category_feedback;
drop policy if exists "cashlog users insert pending feedback" on public.cashlog_category_feedback;
drop policy if exists "cashlog users delete own feedback" on public.cashlog_category_feedback;

create policy "cashlog users read own feedback"
  on public.cashlog_category_feedback for select
  using (auth.uid() = user_id);
create policy "cashlog users insert pending feedback"
  on public.cashlog_category_feedback for insert
  with check (
    auth.uid() = user_id
    and review_status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and (image_object_key is null or image_object_key like (auth.uid()::text || '/%'))
  );
create policy "cashlog users delete own feedback"
  on public.cashlog_category_feedback for delete
  using (auth.uid() = user_id);

commit;
