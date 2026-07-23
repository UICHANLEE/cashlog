import { migrateCategoryId, type PhotoAnalysis } from '../domain/cashlog'
import { normalizeProductImageAnalysis } from '../domain/productImage'

const CLIENT_MAX_IMAGE_EDGE = 960
const CLIENT_JPEG_QUALITY = 0.82
const CLIENT_REENCODE_THRESHOLD_BYTES = 512 * 1024

const errorMessageFromResponseBody = (
  body: Record<string, unknown>,
  fallback: string,
): string => {
  if (typeof body.error === 'string') return body.error
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail)) return body.detail.map((row) => JSON.stringify(row)).join('\n')
  return fallback
}

export async function optimizeProductImageUpload(file: File): Promise<File> {
  if (file.size <= CLIENT_REENCODE_THRESHOLD_BYTES && file.type === 'image/jpeg') return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, CLIENT_MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', CLIENT_JPEG_QUALITY)
    })
    if (!blob || blob.size >= file.size) return file
    const stem = file.name.replace(/\.[^.]+$/, '') || 'cashlog-upload'
    return new File([blob], `${stem}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

export async function remoteAnalyzeProductImage(
  file: File,
  endpoint: string,
): Promise<PhotoAnalysis> {
  const form = new FormData()
  form.append('image', await optimizeProductImageUpload(file))

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
    model:
      analysis.modelVersions.verifier ??
      analysis.modelVersions.classifier ??
      'product-detection-pipeline',
    taxonomyVersion: analysis.taxonomyVersion,
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
