import type { PhotoAnalysis } from '../domain/cashlog'

export type AnalysisOperational = NonNullable<PhotoAnalysis['operational']>

export class AnalysisRequestError extends Error {
  operational: AnalysisOperational
  code: string

  constructor(message: string, operational: AnalysisOperational, code = 'ANALYSIS_REQUEST_FAILED') {
    super(message)
    this.name = 'AnalysisRequestError'
    this.operational = operational
    this.code = code
  }
}

export const analysisNow = () =>
  typeof performance === 'undefined' ? Date.now() : performance.now()

export const elapsedAnalysisMs = (startedAt: number) =>
  Math.max(0, Math.round(analysisNow() - startedAt))

export const readTimingHeader = (response: Response, name: string) => {
  const raw = response.headers.get(name)
  if (!raw?.trim()) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined
}

export const readServerRequestId = (response: Response) => {
  const value = response.headers.get('X-Request-ID')?.trim()
  return value && /^[A-Za-z0-9_-]{8,96}$/.test(value) ? value : undefined
}
