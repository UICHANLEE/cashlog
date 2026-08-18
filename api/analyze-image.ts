/**
 * Vercel Serverless — product photo category recommendation.
 *
 * Document B plan boundary:
 * image upload -> object candidates -> crop/item inference -> category mapper -> feedback.
 *
 * The production YOLO/CLIP/FastAPI service can replace `analyzeProductImage`.
 * Until then this endpoint uses an OpenAI-compatible VLM to return the same contract.
 */
import type { IncomingMessage } from 'node:http'
import { performance } from 'node:perf_hooks'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import sharp from 'sharp'
import { guardApiOrigin } from '../server/httpSecurity.js'
import { assertProductAnalyzerConfig, getProductAnalyzerConfig } from '../server/productAnalyzerGateway.js'
import { assertValidImageBytes } from '../src/media/imageSignature.js'

const ALLOWED_LEAF_IDS = [
  'meal_grocery',
  'meal_dining',
  'meal_cafe',
  'meal_drink',
  'life_goods',
  'life_appliance',
  'life_clean',
  'housing_rent',
  'housing_fee',
  'housing_utility',
  'transit_public',
  'transit_car',
  'transit_maintain',
  'comm_internet',
  'comm_mobile',
  'fashion_clothes',
  'fashion_beauty',
  'health_med',
  'health_gym',
  'edu_class',
  'edu_book',
  'leisure_show',
  'leisure_trip',
  'leisure_hobby',
  'gift_event',
  'gift_present',
  'finance_insure',
  'finance_save',
  'finance_fee',
  'family_kids',
  'family_pet',
  'misc_uncat',
  'misc_other',
] as const

type LeafId = (typeof ALLOWED_LEAF_IDS)[number]

type ProductItem = {
  name: string
  display_name: string
  category: LeafId
  confidence: number
  bbox?: [number, number, number, number]
  top_categories?: { category: LeafId; confidence: number }[]
}

type ProductAnalysis = {
  success: boolean
  recommended_category: LeafId
  confidence: number
  reason: string
  items: ProductItem[]
  need_user_check: boolean
  error_code?: 'NO_OBJECT_DETECTED' | 'LOW_CONFIDENCE' | 'MULTI_CATEGORY_DETECTED' | 'SERVER_ERROR'
}

type ImageInput = {
  imageBase64: string
  mimeType: string
  filename?: string
}

const ALLOWED = new Set<string>(ALLOWED_LEAF_IDS)
const LOW_CONFIDENCE_THRESHOLD = 0.65
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ANALYZER_MAX_EDGE = 960
const ANALYZER_JPEG_QUALITY = 82
const REENCODE_THRESHOLD_BYTES = 512 * 1024

export const config = {
  api: {
    bodyParser: false,
  },
}

const readRequestBody = async (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const getHeader = (req: VercelRequest, name: string) => {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const parseJsonInput = (raw: Buffer): ImageInput | null => {
  try {
    const body = JSON.parse(raw.toString('utf8')) as { imageBase64?: string; mimeType?: string; filename?: string }
    if (!body.imageBase64?.trim()) return null
    return {
      imageBase64: body.imageBase64.trim(),
      mimeType: body.mimeType?.trim() ?? '',
      ...(body.filename?.trim() ? { filename: body.filename.trim() } : {}),
    }
  } catch {
    return null
  }
}

const createRequestId = () => `req_${crypto.randomUUID()}`

export const optimizeAnalyzerInput = async (input: ImageInput): Promise<ImageInput> => {
  const source = Buffer.from(input.imageBase64, 'base64')
  if (source.length <= REENCODE_THRESHOLD_BYTES && input.mimeType === 'image/jpeg') return input

  try {
    const optimized = await sharp(source, {
      failOn: 'error',
      limitInputPixels: 30_000_000,
    })
      .rotate()
      .resize({
        width: ANALYZER_MAX_EDGE,
        height: ANALYZER_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: ANALYZER_JPEG_QUALITY, mozjpeg: true })
      .toBuffer()

    if (optimized.length >= source.length) return input
    const stem = input.filename?.replace(/\.[^.]+$/, '') || 'cashlog-upload'
    return {
      imageBase64: optimized.toString('base64'),
      mimeType: 'image/jpeg',
      filename: `${stem}.jpg`,
    }
  } catch {
    // The model API still validates the original payload. Optimization must never
    // turn a supported client image into an otherwise avoidable request failure.
    return input
  }
}

const groupIdForLeaf = (leaf: LeafId) => leaf.split('_')[0]

const exactTop3 = (item: ProductItem) => {
  const candidates = [...(item.top_categories ?? []), { category: item.category, confidence: item.confidence }]
  const unique = [...new Map(candidates.map((candidate) => [candidate.category, candidate])).values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
  for (const fallback of ['misc_uncat', 'misc_other', 'meal_grocery'] as LeafId[]) {
    if (unique.length >= 3) break
    if (!unique.some((candidate) => candidate.category === fallback)) {
      unique.push({ category: fallback, confidence: 0 })
    }
  }
  const total = unique.reduce((sum, candidate) => sum + candidate.confidence, 0)
  return unique.map((candidate, index) => ({
    ...candidate,
    confidence: total > 0 ? candidate.confidence / total : index === 0 ? 1 : 0,
  }))
}

const toV1Response = (analysis: ProductAnalysis, requestId: string, modelVersion: string) => ({
  request_id: requestId,
  status: 'final',
  revision: 1,
  input_type: { id: 'product', confidence: analysis.confidence },
  products: analysis.items.map((item, index) => ({
    product_id: `p${index + 1}`,
    display_name: item.display_name,
    ...(item.bbox ? { bbox: item.bbox } : {}),
    candidates: exactTop3(item).map((candidate, rank) => ({
      rank: rank + 1,
      group_id: groupIdForLeaf(candidate.category),
      leaf_id: candidate.category,
      confidence: candidate.confidence,
    })),
    evidence: { context: [], appearance: [item.display_name] },
  })),
  decision: {
    mode: analysis.need_user_check ? (analysis.confidence >= 0.6 ? 'show_top3' : 'manual_select') : 'auto_select',
    requires_user_confirmation: analysis.need_user_check,
  },
  verification: { state: 'completed' },
  quality: { label: analysis.success ? 'valid' : 'invalid', confidence: analysis.confidence },
  model_versions: { verifier: modelVersion },
  taxonomy_version: '13.33.1',
  success: analysis.success,
  recommended_category: analysis.recommended_category,
  confidence: analysis.confidence,
  reason: analysis.reason,
  need_user_check: analysis.need_user_check,
  ...(analysis.error_code ? { error_code: analysis.error_code } : {}),
})

const parseMultipartInput = (raw: Buffer, contentType: string): ImageInput | null => {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1]
  if (!boundary) return null

  const parts = raw.toString('binary').split(`--${boundary}`)
  for (const part of parts) {
    if (!part.includes('name="image"')) continue
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const header = part.slice(0, headerEnd)
    const mimeType = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? ''
    const filename = header.match(/filename="([^"]+)"/i)?.[1]?.trim()
    const content = part.slice(headerEnd + 4).replace(/\r\n$/, '')
    const fileBuffer = Buffer.from(content, 'binary')
    if (fileBuffer.length === 0) return null
    return {
      imageBase64: fileBuffer.toString('base64'),
      mimeType,
      ...(filename ? { filename } : {}),
    }
  }
  return null
}

const normalizeLeafId = (raw: unknown): LeafId =>
  typeof raw === 'string' && ALLOWED.has(raw) ? (raw as LeafId) : 'misc_uncat'

const clamp01 = (raw: unknown): number => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const normalizeBbox = (raw: unknown): [number, number, number, number] | undefined => {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined
  const values = raw.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return undefined
  return values as [number, number, number, number]
}

const normalizeTopCategories = (raw: unknown): { category: LeafId; confidence: number }[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((candidate) => {
      const row = candidate as Record<string, unknown>
      return {
        category: normalizeLeafId(row.category),
        confidence: clamp01(row.confidence),
      }
    })
    .filter((candidate) => candidate.confidence > 0)
    .slice(0, 3)
}

const normalizeAnalysis = (raw: Record<string, unknown>): ProductAnalysis => {
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((item) => {
      const row = item as Record<string, unknown>
      const name = String(row.name ?? '').trim()
      const displayName = String(row.display_name ?? row.displayName ?? (name || '상품')).trim()
      const confidence = clamp01(row.confidence)
      const bbox = normalizeBbox(row.bbox)
      const topCategories = normalizeTopCategories(row.top_categories ?? row.topCategories)
      return {
        name: name || displayName,
        display_name: displayName,
        category: normalizeLeafId(row.category),
        confidence,
        ...(bbox ? { bbox } : {}),
        ...(topCategories.length ? { top_categories: topCategories } : {}),
      }
    })
    .filter((item) => item.name || item.display_name)
    .slice(0, 8)

  const confidence = clamp01(raw.confidence)
  const categories = new Set(items.map((item) => item.category))
  const errorCode =
    items.length === 0
      ? 'NO_OBJECT_DETECTED'
      : confidence < LOW_CONFIDENCE_THRESHOLD
        ? 'LOW_CONFIDENCE'
        : categories.size > 1
          ? 'MULTI_CATEGORY_DETECTED'
          : undefined

  return {
    success: items.length > 0,
    recommended_category: normalizeLeafId(raw.recommended_category ?? items[0]?.category),
    confidence,
    reason:
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, 220)
        : '상품 사진의 피사체 단서로 카테고리를 추천했어요.',
    items,
    need_user_check: Boolean(raw.need_user_check) || Boolean(errorCode),
    ...(errorCode ? { error_code: errorCode } : {}),
  }
}

async function analyzeWithLocalCatai(
  input: ImageInput,
  requestId: string,
): Promise<ProductAnalysis | null> {
  const config = getProductAnalyzerConfig()
  if (!config.endpoint) return null
  assertProductAnalyzerConfig(config)

  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const form = new FormData()
  form.append(
    'image',
    new Blob([new Uint8Array(Buffer.from(input.imageBase64, 'base64'))], { type: input.mimeType }),
    input.filename || `cashlog-upload.${extension}`,
  )

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { ...config.headers, 'X-Request-ID': requestId },
    body: form,
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(raw.slice(0, 500) || `Catai HTTP ${response.status}`)
  return normalizeAnalysis(JSON.parse(raw) as Record<string, unknown>)
}

async function analyzeProductImage(input: ImageInput, requestId: string): Promise<ProductAnalysis> {
  const localResult = await analyzeWithLocalCatai(input, requestId)
  if (localResult) return localResult

  const apiBase = (process.env.VISION_API_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.VISION_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'
  const key = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('OPENAI_API_KEY 또는 VISION_API_KEY가 필요합니다.')
  }

  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`
  const leafList = ALLOWED_LEAF_IDS.join(', ')
  const system = `당신은 Cashlog의 상품 사진 기반 가계부 카테고리 추천 엔진입니다.
영수증 OCR이 아니라 상품 사진을 분석합니다. 상품 영역이 여러 개면 items를 여러 개 반환하세요.
반드시 JSON 객체 하나만 반환하세요. 코드펜스 금지.

스키마:
{
  "success": boolean,
  "recommended_category": "${ALLOWED_LEAF_IDS[0]}" 등 아래 id 중 하나,
  "confidence": 0~1,
  "reason": "추천 이유 한 문장",
  "items": [{"name":"coffee","display_name":"커피","category":"meal_cafe","confidence":0.86,"bbox":[120,80,340,420]}],
  "need_user_check": boolean
}

허용 카테고리 id: ${leafList}

기준:
- bbox는 이미지 기준 [x1,y1,x2,y2]로 대략 추정해도 된다.
- 금액은 추론하지 않는다.
- 상품을 찾지 못하면 success=false, items=[], recommended_category="misc_uncat", need_user_check=true.
- 여러 카테고리가 섞이면 대표 카테고리를 recommended_category로 고르고 need_user_check=true.`

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: '상품 사진을 분석해서 스키마 JSON만 반환하세요.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  })

  const raw = await response.text()
  if (!response.ok) throw new Error(raw.slice(0, 500) || `Vision HTTP ${response.status}`)

  const parsed = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
  const content = parsed.choices?.[0]?.message?.content
  if (!content) throw new Error('상품 분석 모델 응답이 비어 있습니다.')
  return normalizeAnalysis(JSON.parse(content) as Record<string, unknown>)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = performance.now()
  const requestId = createRequestId()
  const timings: Record<string, number> = {}
  res.setHeader('X-Request-ID', requestId)

  const setTimingHeaders = (statusCode: number, errorType?: string) => {
    timings.total = performance.now() - startedAt
    res.setHeader(
      'Server-Timing',
      Object.entries(timings)
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(', '),
    )
    for (const [name, duration] of Object.entries(timings)) {
      res.setHeader(`X-Cashlog-${name}-Time-Ms`, duration.toFixed(1))
    }
    console.info(
      JSON.stringify({
        event: 'image_analysis_completed',
        request_id: requestId,
        status_code: statusCode,
        timings_ms: timings,
        ...(errorType ? { error_type: errorType } : {}),
      }),
    )
  }

  if (!guardApiOrigin(req, res)) return
  if (req.method !== 'POST') {
    setTimingHeaders(405, 'METHOD_NOT_ALLOWED')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const readStartedAt = performance.now()
    const contentType = getHeader(req, 'content-type') ?? ''
    const raw = await readRequestBody(req)
    timings.read = performance.now() - readStartedAt
    const input = contentType.includes('multipart/form-data')
      ? parseMultipartInput(raw, contentType)
      : parseJsonInput(raw)

    if (!input) {
      setTimingHeaders(400, 'MISSING_IMAGE')
      res.status(400).json({ error: 'image 파일 또는 imageBase64가 필요합니다.' })
      return
    }

    const byteLength = Buffer.byteLength(input.imageBase64, 'base64')
    if (byteLength > MAX_IMAGE_BYTES) {
      setTimingHeaders(413, 'PAYLOAD_TOO_LARGE')
      res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', error: '이미지는 최대 10MB까지 업로드할 수 있습니다.' })
      return
    }
    const validationStartedAt = performance.now()
    try {
      assertValidImageBytes(
        new Uint8Array(Buffer.from(input.imageBase64, 'base64')),
        input.mimeType,
        input.filename,
      )
    } catch (error) {
      timings.validate = performance.now() - validationStartedAt
      setTimingHeaders(400, 'INVALID_IMAGE')
      res.status(400).json({
        code: 'INVALID_INPUT',
        error: error instanceof Error ? error.message : '유효한 이미지 파일이 아니에요.',
      })
      return
    }
    timings.validate = performance.now() - validationStartedAt

    const optimizeStartedAt = performance.now()
    const analyzerInput = await optimizeAnalyzerInput(input)
    timings.optimize = performance.now() - optimizeStartedAt
    const analyzerByteLength = Buffer.byteLength(analyzerInput.imageBase64, 'base64')

    const analyzerStartedAt = performance.now()
    const analysis = await analyzeProductImage(analyzerInput, requestId)
    timings.analyzer = performance.now() - analyzerStartedAt
    const modelVersion = getProductAnalyzerConfig().endpoint
      ? process.env.CATAI_MODEL_VERSION?.trim() || 'catai-cashlog'
      : process.env.VISION_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'
    res.setHeader('X-Upload-Bytes-In', String(byteLength))
    res.setHeader('X-Analyzer-Bytes-Out', String(analyzerByteLength))
    setTimingHeaders(200)
    res.status(200).json(toV1Response(analysis, requestId, modelVersion))
  } catch (e) {
    setTimingHeaders(502, e instanceof Error ? e.name : 'UnknownError')
    res.status(502).json({
      success: false,
      code: 'ANALYZER_UNAVAILABLE',
      recommended_category: 'misc_uncat',
      confidence: 0,
      reason: '지금은 상품을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.',
      items: [],
      need_user_check: true,
      error_code: 'ANALYZER_UNAVAILABLE',
      error: '상품 분석 서버를 사용할 수 없어요.',
    })
  }
}
