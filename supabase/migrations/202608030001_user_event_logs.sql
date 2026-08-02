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

alter table public.cashlog_event_logs enable row level security;
revoke all on table public.cashlog_event_logs from anon, authenticated;
grant select, insert, delete on table public.cashlog_event_logs to service_role;

create or replace function public.cashlog_admin_event_summary()
returns jsonb
language sql
security definer set search_path = ''
stable
as $$
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

-- Keep account deletion scoped to Cashlog-owned records, including product events.
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
