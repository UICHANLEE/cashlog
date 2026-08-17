import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isAnalyticsEventName,
  listAnalyticsRows,
  pruneAnalyticsRows,
  readAnalyticsSummary,
} from '../server/analytics.js'
import { requireAdminUser } from '../server/auth/admin.js'
import { ApiError, requireMethod, sendError } from '../server/auth/http.js'
import { guardApiOrigin } from '../server/httpSecurity.js'
import {
  getProductAnalyzerConfig,
  type ProductAnalyzerConfig,
} from '../server/productAnalyzerGateway.js'

type AdminAction = 'events' | 'status'

type AnalyzerStatus =
  | {
      status: 'ok'
      httpStatus: number
      health: unknown
    }
  | {
      status: 'not_configured'
      httpStatus: null
      error: string
    }
  | {
      status: 'error'
      httpStatus: number | null
      error: string
      health?: unknown
    }

const ADMIN_ACTIONS = new Set<AdminAction>(['events', 'status'])

const singleQuery = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const readAdminAction = (value: string | string[] | undefined): AdminAction | null => {
  const action = singleQuery(value)
  return action && ADMIN_ACTIONS.has(action as AdminAction) ? action as AdminAction : null
}

const safeOrigin = (raw: string | null) => {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return 'invalid-url'
  }
}

const readResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const safeHealthSummary = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const summary: Record<string, unknown> = {}
  for (const key of ['status', 'ready', 'model_loaded', 'engine', 'model']) {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'boolean') summary[key] = value
  }
  return Object.keys(summary).length ? summary : undefined
}

const checkAnalyzer = async (config: ProductAnalyzerConfig): Promise<AnalyzerStatus> => {
  if (!config.endpoint || !config.healthUrl) {
    return {
      status: 'not_configured',
      httpStatus: null,
      error: 'PRODUCT_ANALYZER_API_URL is not configured.',
    }
  }
  if (config.configurationError) {
    return {
      status: 'error',
      httpStatus: null,
      error: config.configurationError,
    }
  }

  try {
    const response = await fetch(config.healthUrl, {
      headers: { ...config.headers, Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 10_000)),
    })
    const body = await readResponseBody(response)
    if (!response.ok) {
      return {
        status: 'error',
        httpStatus: response.status,
        error: `Health check failed with HTTP ${response.status}.`,
        health: safeHealthSummary(body),
      }
    }
    return {
      status: 'ok',
      httpStatus: response.status,
      health: safeHealthSummary(body),
    }
  } catch (error) {
    return {
      status: 'error',
      httpStatus: null,
      error: error instanceof Error ? error.message : 'Analyzer health check failed.',
    }
  }
}

const sendEvents = async (req: VercelRequest, res: VercelResponse) => {
  const limit = Math.min(100, Math.max(10, Number(singleQuery(req.query.limit)) || 50))
  const offset = Math.max(0, Number(singleQuery(req.query.offset)) || 0)
  const rawEventName = singleQuery(req.query.eventName)?.trim()
  if (rawEventName && !isAnalyticsEventName(rawEventName)) {
    throw new ApiError(400, 'INVALID_EVENT_FILTER', '이벤트 필터를 확인해 주세요.')
  }
  const rawSince = singleQuery(req.query.since)
  const sinceDate = rawSince ? new Date(rawSince) : null
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    throw new ApiError(400, 'INVALID_DATE_FILTER', '조회 기간을 확인해 주세요.')
  }

  await pruneAnalyticsRows(90)
  const [summary, result] = await Promise.all([
    readAnalyticsSummary(),
    listAnalyticsRows({
      limit,
      offset,
      ...(rawEventName && isAnalyticsEventName(rawEventName)
        ? { eventName: rawEventName }
        : {}),
      ...(sinceDate ? { since: sinceDate.toISOString() } : {}),
    }),
  ])
  res.status(200).json({
    success: true,
    checkedAt: new Date().toISOString(),
    summary,
    total: result.total,
    limit,
    offset,
    events: result.events,
  })
}

const sendStatus = async (res: VercelResponse) => {
  const analyzerConfig = getProductAnalyzerConfig()
  const analyzer = await checkAnalyzer(analyzerConfig)

  res.status(200).json({
    checkedAt: new Date().toISOString(),
    cashlog: {
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
      vercelEnv: process.env.VERCEL_ENV ?? null,
      supabaseConfigured: Boolean(
        process.env.VITE_SUPABASE_URL &&
          (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      ),
      productAnalyzerConfigured: Boolean(analyzerConfig.endpoint),
      productAnalyzerOrigin: safeOrigin(analyzerConfig.endpoint),
      productAnalyzerSecured:
        analyzerConfig.authMode !== 'none' && !analyzerConfig.configurationError,
      productAnalyzerAuthMode: analyzerConfig.authMode,
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      visionConfigured: Boolean(
        process.env.VISION_API_KEY || process.env.HF_TOKEN || process.env.OPENAI_API_KEY,
      ),
    },
    analyzer,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'GET')
    await requireAdminUser(req)
    const action = readAdminAction(req.query.action)
    if (!action) {
      throw new ApiError(404, 'ADMIN_ROUTE_NOT_FOUND', '관리자 요청 경로를 찾을 수 없어요.')
    }
    if (action === 'events') await sendEvents(req, res)
    else await sendStatus(res)
  } catch (error) {
    sendError(res, error)
  }
}
