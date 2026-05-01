import { migrateCategoryId, type PhotoAnalysis } from '../domain/cashlog'
import { fileToPureBase64 } from './imageToBase64'

/** Vercel `api/analyze` 등 동일 출처 또는 절대 URL */
export async function remoteAnalyzePhoto(
  file: File,
  endpoint: string,
): Promise<PhotoAnalysis> {
  const imageBase64 = await fileToPureBase64(file)
  const mimeType = file.type || 'image/jpeg'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = {}
  }

  if (!res.ok) {
    const err =
      typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : text || `분석 요청 실패 (${res.status})`
    throw new Error(err)
  }

  const o = body as Record<string, unknown>
  const analysis: PhotoAnalysis = {
    suggestedAmount: Number(o.suggestedAmount),
    suggestedCategory: migrateCategoryId(String(o.suggestedCategory ?? '')),
    suggestedTitle: String(o.suggestedTitle ?? ''),
    suggestedMemo: String(o.suggestedMemo ?? ''),
    confidence: Number(o.confidence),
    rawText: String(o.rawText ?? ''),
    engine: 'openai',
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
