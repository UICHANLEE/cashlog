import { migrateCategoryId, type PhotoAnalysis } from '../domain/cashlog'
import { normalizeProductImageAnalysis } from '../domain/productImage'

const errorMessageFromResponseBody = (
  body: Record<string, unknown>,
  fallback: string,
): string => {
  if (typeof body.error === 'string') return body.error
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail)) return body.detail.map((row) => JSON.stringify(row)).join('\n')
  return fallback
}

export async function remoteAnalyzeProductImage(
  file: File,
  endpoint: string,
): Promise<PhotoAnalysis> {
  const form = new FormData()
  form.append('image', file)

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
  })

  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = {}
  }

  if (!response.ok) {
    const error = errorMessageFromResponseBody(
      body as Record<string, unknown>,
      text || `상품 분석 요청 실패 (${response.status})`,
    )
    throw new Error(error)
  }

  const analysis = normalizeProductImageAnalysis(body)
  const firstItem = analysis.items[0]
  const objects = analysis.items.map((item) => item.displayName || item.name).filter(Boolean)

  return {
    requestId: analysis.requestId,
    status: analysis.status,
    revision: analysis.revision,
    suggestedAmount: 0,
    suggestedCategory: migrateCategoryId(analysis.recommendedCategory),
    suggestedTitle: firstItem?.displayName ? `${firstItem.displayName} 기록` : '상품 사진 기록',
    suggestedMemo: analysis.reason,
    confidence: analysis.confidence,
    rawText: objects.length ? objects.join(', ') : analysis.reason,
    engine: 'custom',
    model: 'product-detection-pipeline',
    detectedObjects: objects,
    detectedItems: analysis.items,
    topCategories: firstItem?.topCategories ?? [
      { category: analysis.recommendedCategory, confidence: analysis.confidence },
    ],
    needUserCheck: analysis.needUserCheck,
    errorCode: analysis.errorCode,
    categoryReason: analysis.reason,
  }
}
