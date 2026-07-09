import { migrateCategoryId, type PhotoAnalysis } from '../domain/cashlog'
import { normalizeProductImageAnalysis } from '../domain/productImage'

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
    const error =
      typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : text || `상품 분석 요청 실패 (${response.status})`
    throw new Error(error)
  }

  const analysis = normalizeProductImageAnalysis(body)
  const firstItem = analysis.items[0]
  const objects = analysis.items.map((item) => item.displayName || item.name).filter(Boolean)

  return {
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
