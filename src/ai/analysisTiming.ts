import type { PhotoAnalysis } from '../domain/cashlog'

export type AnalysisOperational = NonNullable<PhotoAnalysis['operational']>

export class AnalysisRequestError extends Error {
  operational: AnalysisOperational

  constructor(message: string, operational: AnalysisOperational) {
    super(message)
    this.name = 'AnalysisRequestError'
    this.operational = operational
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
