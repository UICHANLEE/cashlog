import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  normalizeAnalyticsBatch,
  optionalAnalyticsUserId,
  storeAnalyticsRows,
  type AnalyticsBatchInput,
} from '../server/analytics.js'
import { enforceRateLimit } from '../server/auth/supabase.js'
import { readJson, requireMethod, sendError } from '../server/auth/http.js'
import { guardApiOrigin } from '../server/httpSecurity.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  const startedAt = Date.now()
  try {
    requireMethod(req, 'POST')
    await enforceRateLimit(req, 'analytics', 120, 60)
    const body = readJson<AnalyticsBatchInput>(req)
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 16 * 1024) {
      res.status(413).json({ success: false, code: 'ANALYTICS_PAYLOAD_TOO_LARGE', message: '사용 로그 요청이 너무 커요.' })
      return
    }
    const userId = await optionalAnalyticsUserId(req)
    const rows = normalizeAnalyticsBatch(body, userId)
    await storeAnalyticsRows(rows)
    console.log(JSON.stringify({
      level: 'info',
      message: 'analytics_batch_stored',
      route: '/api/events',
      eventCount: rows.length,
      authenticated: Boolean(userId),
      durationMs: Date.now() - startedAt,
      requestId: req.headers['x-vercel-id'] || null,
    }))
    res.status(202).json({ success: true, accepted: rows.length })
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'analytics_batch_failed',
      route: '/api/events',
      errorCode: error instanceof Error ? error.name : 'unknown',
      durationMs: Date.now() - startedAt,
      requestId: req.headers['x-vercel-id'] || null,
    }))
    sendError(res, error)
  }
}
