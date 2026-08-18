import { migrateCategoryId, type PhotoAnalysis } from '../domain/cashlog'
import {
  AnalysisRequestError,
  analysisNow,
  elapsedAnalysisMs,
  readServerRequestId,
  readTimingHeader,
} from './analysisTiming'
import { fileToPureBase64 } from './imageToBase64'

/** Vercel `api/analyze` 등 동일 출처 또는 절대 URL */
export async function remoteAnalyzePhoto(
  file: File,
  endpoint: string,
): Promise<PhotoAnalysis> {
  const requestStartedAt = analysisNow()
  const preprocessStartedAt = analysisNow()
  const imageBase64 = await fileToPureBase64(file)
  const preprocessDurationMs = elapsedAnalysisMs(preprocessStartedAt)
  const mimeType = file.type || 'image/jpeg'

  const networkStartedAt = analysisNow()
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType, filename: file.name }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new AnalysisRequestError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? '사진 분석 시간이 초과됐어요. 다시 시도해 주세요.'
        : '사진 분석 서버에 연결하지 못했어요.',
      {
        pipeline: 'receipt',
        requestDurationMs: elapsedAnalysisMs(requestStartedAt),
        preprocessDurationMs,
        networkDurationMs: elapsedAnalysisMs(networkStartedAt),
        payloadKb: Math.round(file.size / 1024),
      },
      error instanceof DOMException && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    )
  }

  const text = await res.text()
  const networkDurationMs = elapsedAnalysisMs(networkStartedAt)
  let body: unknown
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = {}
  }

  const operational = {
    pipeline: 'receipt',
    serverRequestId: readServerRequestId(res),
    requestDurationMs: elapsedAnalysisMs(requestStartedAt),
    serverDurationMs: readTimingHeader(res, 'X-Cashlog-total-Time-Ms'),
    modelDurationMs: readTimingHeader(res, 'X-Cashlog-model-Time-Ms'),
    preprocessDurationMs,
    networkDurationMs,
    payloadKb: Math.round(file.size / 1024),
    httpStatus: res.status,
  }

  if (!res.ok) {
    const err = res.status >= 500
      ? '지금은 사진을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.'
      : typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : `분석 요청 실패 (${res.status})`
    const code = typeof (body as Record<string, unknown>).code === 'string'
      ? String((body as Record<string, unknown>).code)
      : `HTTP_${res.status}`
    throw new AnalysisRequestError(err, operational, code)
  }

  const o = body as Record<string, unknown>
  const analysis: PhotoAnalysis = {
    suggestedAmount: Number(o.suggestedAmount),
    suggestedCategory: migrateCategoryId(String(o.suggestedCategory ?? '')),
    suggestedTitle: String(o.suggestedTitle ?? ''),
    suggestedMemo: String(o.suggestedMemo ?? ''),
    confidence: Number(o.confidence),
    rawText: String(o.rawText ?? ''),
    engine:
      o.engine === 'qwen' || o.engine === 'paddleocr' || o.engine === 'custom'
        ? o.engine
        : 'openai',
    model: typeof o.model === 'string' ? o.model : undefined,
    ocrText: typeof o.ocrText === 'string' ? o.ocrText : undefined,
    detectedObjects: Array.isArray(o.detectedObjects)
      ? o.detectedObjects.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [],
    categoryReason: typeof o.categoryReason === 'string' ? o.categoryReason : undefined,
    operational,
  }

  if (
    !Number.isFinite(analysis.suggestedAmount) ||
    analysis.suggestedAmount <= 0 ||
    !Number.isFinite(analysis.confidence)
  ) {
    throw new Error('분석 응답 형식이 올바르지 않아요.')
  }

  return analysis
}
