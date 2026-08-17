import { createHmac } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { ACCESS_COOKIE, readCookies } from './auth/cookies.js'
import { ApiError } from './auth/http.js'
import { getAuthUser, serviceRequest } from './auth/supabase.js'

export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'page_duration',
  'view_opened',
  'view_duration',
  'first_action',
  'action_clicked',
  'form_started',
  'form_submitted',
  'account_panel_opened',
  'auth_started',
  'auth_succeeded',
  'auth_failed',
  'camera_opened',
  'media_selected',
  'analysis_started',
  'analysis_succeeded',
  'analysis_failed',
  'analysis_feedback',
  'record_saved',
  'story_opened',
  'story_rendered',
  'view_ready',
  'pet_interacted',
  'pet_customized',
  'reservation_submitted',
  'profile_updated',
  'password_reset_requested',
  'password_changed',
  'account_deleted',
  'client_error',
] as const

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number]

const EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES)
const PROPERTY_KEYS = new Set([
  'page',
  'view',
  'source',
  'mode',
  'provider',
  'result',
  'media_type',
  'has_media',
  'has_location',
  'analysis_mode',
  'entry_kind',
  'story_type',
  'pet_kind',
  'action',
  'status',
  'error_name',
  'error_code',
  'device',
  'viewport',
  'connection',
  'authenticated',
  'scope',
  'view_id',
  'action_id',
  'action_type',
  'action_sequence',
  'duration_ms',
  'total_duration_ms',
  'time_to_action_ms',
  'scroll_depth_pct',
  'reason',
  'trace_id',
  'pipeline',
  'model',
  'engine',
  'suggested_category',
  'selected_category',
  'operation',
  'confidence_band',
  'server_duration_ms',
  'model_duration_ms',
  'preprocess_duration_ms',
  'network_duration_ms',
  'confidence_pct',
  'payload_kb',
  'item_count',
  'slide_count',
  'http_status',
  'corrected',
  'needs_review',
])

const TOKEN_PROPERTY_KEYS = new Set([
  'page',
  'view',
  'source',
  'mode',
  'provider',
  'result',
  'media_type',
  'analysis_mode',
  'entry_kind',
  'story_type',
  'pet_kind',
  'action',
  'status',
  'error_name',
  'error_code',
  'device',
  'viewport',
  'connection',
  'scope',
  'view_id',
  'action_id',
  'action_type',
  'reason',
  'trace_id',
  'pipeline',
  'model',
  'engine',
  'suggested_category',
  'selected_category',
  'operation',
  'confidence_band',
])

const TOKEN_VALUE = /^[a-z0-9/][a-z0-9_.:/-]{0,79}$/i
const BOOLEAN_PROPERTY_KEYS = new Set([
  'has_media',
  'has_location',
  'authenticated',
  'corrected',
  'needs_review',
])
const NUMBER_LIMITS: Record<string, [number, number]> = {
  action_sequence: [1, 10_000],
  duration_ms: [0, 86_400_000],
  total_duration_ms: [0, 86_400_000],
  time_to_action_ms: [0, 86_400_000],
  scroll_depth_pct: [0, 100],
  server_duration_ms: [0, 120_000],
  model_duration_ms: [0, 120_000],
  preprocess_duration_ms: [0, 120_000],
  network_duration_ms: [0, 120_000],
  confidence_pct: [0, 100],
  payload_kb: [0, 10_240],
  item_count: [0, 1_000],
  slide_count: [0, 500],
  http_status: [100, 599],
}

export type AnalyticsInput = {
  name?: unknown
  occurredAt?: unknown
  path?: unknown
  properties?: unknown
}

export type AnalyticsBatchInput = {
  sessionId?: unknown
  events?: unknown
}

type AnalyticsRow = {
  user_id: string | null
  session_hash: string
  event_name: AnalyticsEventName
  path: string
  properties: Record<string, string | number | boolean>
  occurred_at: string
}

const readSalt = () => {
  const salt = String(process.env.ANALYTICS_HASH_SALT || process.env.AUTH_RATE_LIMIT_SALT || '')
  if (salt.length < 32) {
    throw new ApiError(503, 'ANALYTICS_NOT_CONFIGURED', '사용 로그 저장 설정이 필요해요.')
  }
  return salt
}

const normalizePath = (raw: unknown) => {
  const value = typeof raw === 'string' ? raw.trim() : '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    return new URL(value, 'https://cashlog.invalid').pathname.slice(0, 160) || '/'
  } catch {
    return '/'
  }
}

const normalizeOccurredAt = (raw: unknown, now = Date.now()) => {
  const value = typeof raw === 'string' ? new Date(raw).getTime() : Number.NaN
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(value) || value < now - sevenDays || value > now + 5 * 60 * 1000) {
    return new Date(now).toISOString()
  }
  return new Date(value).toISOString()
}

const normalizeProperties = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const output: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw).slice(0, 28)) {
    if (!PROPERTY_KEYS.has(key)) continue
    if (BOOLEAN_PROPERTY_KEYS.has(key)) {
      if (typeof value === 'boolean') output[key] = value
    } else if (key in NUMBER_LIMITS && typeof value === 'number' && Number.isFinite(value)) {
      const [minimum, maximum] = NUMBER_LIMITS[key] ?? [-1_000_000, 1_000_000]
      output[key] = Math.round(Math.max(minimum, Math.min(maximum, value)))
    } else if (TOKEN_PROPERTY_KEYS.has(key) && typeof value === 'string') {
      const candidate = value.trim().slice(0, 80)
      if (TOKEN_VALUE.test(candidate)) output[key] = candidate
    }
  }
  return output
}

export const isAnalyticsEventName = (value: string): value is AnalyticsEventName =>
  EVENT_NAME_SET.has(value)

export const normalizeAnalyticsBatch = (
  input: AnalyticsBatchInput,
  userId: string | null,
): AnalyticsRow[] => {
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!/^[A-Za-z0-9_-]{16,96}$/.test(sessionId)) {
    throw new ApiError(400, 'INVALID_ANALYTICS_SESSION', '사용 로그 세션을 확인하지 못했어요.')
  }
  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > 20) {
    throw new ApiError(400, 'INVALID_ANALYTICS_BATCH', '사용 로그 묶음은 1개에서 20개까지 보낼 수 있어요.')
  }
  const sessionHash = createHmac('sha256', readSalt()).update(sessionId).digest('hex')
  return input.events.map((raw) => {
    const event = (raw && typeof raw === 'object' ? raw : {}) as AnalyticsInput
    const name = typeof event.name === 'string' ? event.name : ''
    if (!isAnalyticsEventName(name)) {
      throw new ApiError(400, 'INVALID_ANALYTICS_EVENT', '지원하지 않는 사용 로그 이벤트예요.')
    }
    return {
      user_id: userId,
      session_hash: sessionHash,
      event_name: name,
      path: normalizePath(event.path),
      properties: normalizeProperties(event.properties),
      occurred_at: normalizeOccurredAt(event.occurredAt),
    }
  })
}

export const optionalAnalyticsUserId = async (req: VercelRequest) => {
  const token = readCookies(req)[ACCESS_COOKIE]
  if (!token) return null
  try {
    return (await getAuthUser(token)).id
  } catch {
    return null
  }
}

export const storeAnalyticsRows = async (rows: AnalyticsRow[]) => {
  const response = await serviceRequest('/rest/v1/cashlog_event_logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!response.ok) {
    throw new ApiError(503, 'ANALYTICS_STORAGE_UNAVAILABLE', '사용 로그를 저장하지 못했어요.')
  }
}

export const readAnalyticsSummary = async () => {
  const response = await serviceRequest('/rest/v1/rpc/cashlog_admin_event_summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) throw new ApiError(503, 'ANALYTICS_QUERY_FAILED', '사용 로그 요약을 불러오지 못했어요.')
  return response.json() as Promise<Record<string, unknown>>
}

export const pruneAnalyticsRows = async (retentionDays = 90) => {
  const response = await serviceRequest('/rest/v1/rpc/cashlog_prune_event_logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_days: retentionDays }),
  })
  return response.ok
}

export const listAnalyticsRows = async ({
  limit,
  offset,
  eventName,
  since,
}: {
  limit: number
  offset: number
  eventName?: AnalyticsEventName
  since?: string
}) => {
  const query = new URLSearchParams({
    select: 'id,user_id,session_hash,event_name,path,properties,occurred_at,received_at',
    order: 'occurred_at.desc',
    limit: String(limit),
    offset: String(offset),
  })
  if (eventName) query.set('event_name', `eq.${eventName}`)
  if (since) query.set('occurred_at', `gte.${since}`)
  const response = await serviceRequest(`/rest/v1/cashlog_event_logs?${query}`, {
    headers: { Prefer: 'count=exact' },
  })
  if (!response.ok) throw new ApiError(503, 'ANALYTICS_QUERY_FAILED', '사용 로그를 불러오지 못했어요.')
  const contentRange = response.headers.get('content-range') || ''
  const total = Number(contentRange.split('/')[1])
  const rows = await response.json() as Array<{
    id: string
    user_id: string | null
    session_hash: string
    event_name: AnalyticsEventName
    path: string
    properties: Record<string, string | number | boolean>
    occurred_at: string
    received_at: string
  }>
  return {
    total: Number.isFinite(total) ? total : rows.length,
    events: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_hash.slice(0, 12),
      name: row.event_name,
      path: row.path,
      properties: row.properties,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
    })),
  }
}
