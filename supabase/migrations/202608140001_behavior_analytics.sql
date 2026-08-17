-- Add privacy-safe engagement aggregates for page/view dwell time and actions.
create index if not exists cashlog_event_logs_behavior_view_idx
  on public.cashlog_event_logs (event_name, (properties->>'view_id'), occurred_at desc)
  where event_name in ('page_view', 'view_opened', 'page_duration', 'view_duration', 'first_action');

create index if not exists cashlog_event_logs_behavior_action_idx
  on public.cashlog_event_logs ((properties->>'action_id'), occurred_at desc)
  where event_name = 'action_clicked';

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
      sum(case
        when properties->>'duration_ms' ~ '^[0-9]+$' then (properties->>'duration_ms')::numeric
        else 0
      end) as dwell_ms,
      max(case
        when properties->>'scroll_depth_pct' ~ '^[0-9]+$' then (properties->>'scroll_depth_pct')::numeric
        else 0
      end) as scroll_depth_pct,
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
      case
        when properties->>'time_to_action_ms' ~ '^[0-9]+$' then (properties->>'time_to_action_ms')::numeric
        else null
      end as time_to_action_ms,
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
    left join dwell_7d dwell
      on dwell.session_hash = opened.session_hash
      and dwell.view_id = opened.view_id
    left join first_actions_7d first_action
      on first_action.session_hash = opened.session_hash
      and first_action.view_id = opened.view_id
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
      where event_name = 'action_clicked'
        and occurred_at >= now() - interval '24 hours'
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
