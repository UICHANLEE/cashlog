-- Add privacy-safe model, photo flow, view and story performance aggregates.
-- This migration does not store images, OCR text, amounts, memos or coordinates.
create index if not exists cashlog_event_logs_operation_trace_idx
  on public.cashlog_event_logs (event_name, (properties->>'trace_id'), occurred_at desc)
  where event_name in (
    'analysis_started',
    'analysis_succeeded',
    'analysis_failed',
    'analysis_feedback',
    'story_opened',
    'story_rendered',
    'view_ready'
  );

create index if not exists cashlog_event_logs_operation_model_idx
  on public.cashlog_event_logs ((properties->>'model'), occurred_at desc)
  where event_name in ('analysis_succeeded', 'analysis_feedback');

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
  ), analysis_results_7d as (
    select
      event_name,
      occurred_at,
      coalesce(nullif(properties->>'pipeline', ''), 'unknown') as pipeline,
      coalesce(nullif(properties->>'model', ''), 'unknown') as model,
      case when properties->>'duration_ms' ~ '^[0-9]+$' then (properties->>'duration_ms')::numeric end as duration_ms,
      case when properties->>'model_duration_ms' ~ '^[0-9]+$' then (properties->>'model_duration_ms')::numeric end as model_duration_ms,
      case when properties->>'confidence_pct' ~ '^[0-9]+$' then (properties->>'confidence_pct')::numeric end as confidence_pct
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name in ('analysis_succeeded', 'analysis_failed')
      and properties ? 'trace_id'
  ), analysis_feedback_7d as (
    select
      coalesce(nullif(properties->>'model', ''), 'unknown') as model,
      coalesce(nullif(properties->>'suggested_category', ''), 'unknown') as suggested_category,
      properties->>'corrected' = 'true' as corrected,
      case when properties->>'confidence_pct' ~ '^[0-9]+$' then (properties->>'confidence_pct')::numeric end as confidence_pct
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name = 'analysis_feedback'
      and properties ? 'trace_id'
  ), story_results_7d as (
    select
      coalesce(nullif(properties->>'story_type', ''), 'unknown') as story_type,
      case when properties->>'duration_ms' ~ '^[0-9]+$' then (properties->>'duration_ms')::numeric end as duration_ms,
      case when properties->>'slide_count' ~ '^[0-9]+$' then (properties->>'slide_count')::numeric end as slide_count
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name = 'story_rendered'
      and properties ? 'trace_id'
  ), operation_results_7d as (
    select
      coalesce(nullif(properties->>'operation', ''), event_name) as operation,
      event_name,
      properties->>'status' as status,
      case when properties->>'duration_ms' ~ '^[0-9]+$' then (properties->>'duration_ms')::numeric end as duration_ms
    from public.cashlog_event_logs
    where occurred_at >= now() - interval '7 days'
      and event_name in (
        'analysis_succeeded',
        'analysis_failed',
        'story_rendered',
        'view_ready',
        'camera_opened',
        'record_saved'
      )
      and properties ? 'duration_ms'
  )
  select jsonb_build_object(
    'operationalVersion', 1,
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
    'analysisAttempts24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'analysis_started'
        and occurred_at >= now() - interval '24 hours'
        and properties ? 'trace_id'
    ),
    'analysisSucceeded24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'analysis_succeeded'
        and occurred_at >= now() - interval '24 hours'
        and properties ? 'trace_id'
    ),
    'analysisFailed24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'analysis_failed'
        and occurred_at >= now() - interval '24 hours'
        and properties ? 'trace_id'
    ),
    'analysisSuccessRate24h', coalesce((
      select round(100.0 * count(*) filter (where event_name = 'analysis_succeeded') / nullif(count(*), 0), 1)
      from analysis_results_7d
      where occurred_at >= now() - interval '24 hours'
    ), 0),
    'analysisP50Ms7d', coalesce((
      select round((percentile_cont(0.5) within group (order by duration_ms))::numeric)::bigint
      from analysis_results_7d
      where event_name = 'analysis_succeeded' and duration_ms is not null
    ), 0),
    'analysisP95Ms7d', coalesce((
      select round((percentile_cont(0.95) within group (order by duration_ms))::numeric)::bigint
      from analysis_results_7d
      where event_name = 'analysis_succeeded' and duration_ms is not null
    ), 0),
    'modelP50Ms7d', coalesce((
      select round((percentile_cont(0.5) within group (order by model_duration_ms))::numeric)::bigint
      from analysis_results_7d
      where event_name = 'analysis_succeeded' and model_duration_ms is not null
    ), 0),
    'modelP95Ms7d', coalesce((
      select round((percentile_cont(0.95) within group (order by model_duration_ms))::numeric)::bigint
      from analysis_results_7d
      where event_name = 'analysis_succeeded' and model_duration_ms is not null
    ), 0),
    'avgConfidencePct7d', coalesce((
      select round(avg(confidence_pct), 1)
      from analysis_results_7d
      where event_name = 'analysis_succeeded' and confidence_pct is not null
    ), 0),
    'feedbackSamples7d', (select count(*) from analysis_feedback_7d),
    'categoryAcceptanceRate7d', coalesce((
      select round(100.0 * count(*) filter (where not corrected) / nullif(count(*), 0), 1)
      from analysis_feedback_7d
    ), 0),
    'categoryCorrectionRate7d', coalesce((
      select round(100.0 * count(*) filter (where corrected) / nullif(count(*), 0), 1)
      from analysis_feedback_7d
    ), 0),
    'storyOpens24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'story_opened'
        and occurred_at >= now() - interval '24 hours'
        and properties ? 'trace_id'
    ),
    'storyRendered24h', (
      select count(*) from public.cashlog_event_logs
      where event_name = 'story_rendered'
        and occurred_at >= now() - interval '24 hours'
        and properties ? 'trace_id'
    ),
    'storyRenderRate24h', coalesce((
      select round(100.0 *
        (select count(*) from public.cashlog_event_logs where event_name = 'story_rendered' and occurred_at >= now() - interval '24 hours' and properties ? 'trace_id') /
        nullif((select count(*) from public.cashlog_event_logs where event_name = 'story_opened' and occurred_at >= now() - interval '24 hours' and properties ? 'trace_id'), 0),
        1
      )
    ), 0),
    'storyP50Ms7d', coalesce((
      select round((percentile_cont(0.5) within group (order by duration_ms))::numeric)::bigint
      from story_results_7d where duration_ms is not null
    ), 0),
    'storyP95Ms7d', coalesce((
      select round((percentile_cont(0.95) within group (order by duration_ms))::numeric)::bigint
      from story_results_7d where duration_ms is not null
    ), 0),
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
    ), '[]'::jsonb),
    'operationBreakdown7d', coalesce((
      select jsonb_agg(to_jsonb(operation_rows))
      from (
        select
          operation,
          count(*)::integer as count,
          count(*) filter (
            where event_name = 'analysis_failed' or status in ('failed', 'unsupported')
          )::integer as errors,
          coalesce(round(avg(duration_ms)), 0)::bigint as "avgDurationMs",
          coalesce(round((percentile_cont(0.5) within group (order by duration_ms))::numeric), 0)::bigint as "p50DurationMs",
          coalesce(round((percentile_cont(0.95) within group (order by duration_ms))::numeric), 0)::bigint as "p95DurationMs"
        from operation_results_7d
        group by operation
        order by count(*) desc, operation
      ) operation_rows
    ), '[]'::jsonb),
    'modelQuality7d', coalesce((
      select jsonb_agg(to_jsonb(model_rows))
      from (
        select
          model,
          count(*)::integer as samples,
          round(100.0 * count(*) filter (where not corrected) / nullif(count(*), 0), 1) as "acceptanceRate",
          round(100.0 * count(*) filter (where corrected) / nullif(count(*), 0), 1) as "correctionRate",
          coalesce(round(avg(confidence_pct), 1), 0) as "avgConfidencePct"
        from analysis_feedback_7d
        group by model
        order by count(*) desc, model
      ) model_rows
    ), '[]'::jsonb),
    'categoryQuality7d', coalesce((
      select jsonb_agg(to_jsonb(category_rows))
      from (
        select
          suggested_category as "suggestedCategory",
          count(*)::integer as samples,
          round(100.0 * count(*) filter (where not corrected) / nullif(count(*), 0), 1) as "acceptanceRate",
          round(100.0 * count(*) filter (where corrected) / nullif(count(*), 0), 1) as "correctionRate"
        from analysis_feedback_7d
        group by suggested_category
        order by count(*) desc, suggested_category
        limit 12
      ) category_rows
    ), '[]'::jsonb),
    'storyPerformance7d', coalesce((
      select jsonb_agg(to_jsonb(story_rows))
      from (
        select
          story_type as "storyType",
          count(*)::integer as renders,
          coalesce(round(avg(duration_ms)), 0)::bigint as "avgDurationMs",
          coalesce(round((percentile_cont(0.5) within group (order by duration_ms))::numeric), 0)::bigint as "p50DurationMs",
          coalesce(round((percentile_cont(0.95) within group (order by duration_ms))::numeric), 0)::bigint as "p95DurationMs",
          coalesce(round(avg(slide_count)), 0)::integer as "avgSlides"
        from story_results_7d
        group by story_type
        order by story_type
      ) story_rows
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.cashlog_admin_event_summary() from public, anon, authenticated;
grant execute on function public.cashlog_admin_event_summary() to service_role;
