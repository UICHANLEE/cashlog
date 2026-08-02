import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isAnalyticsEventName,
  listAnalyticsRows,
  pruneAnalyticsRows,
  readAnalyticsSummary,
} from '../../server/analytics.js'
import { requireAdminUser } from '../../server/auth/admin.js'
import { ApiError, requireMethod, sendError } from '../../server/auth/http.js'
import { guardApiOrigin } from '../../server/httpSecurity.js'

const singleQuery = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'GET')
    await requireAdminUser(req)
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
        ...(rawEventName && isAnalyticsEventName(rawEventName) ? { eventName: rawEventName } : {}),
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
  } catch (error) {
    sendError(res, error)
  }
}
