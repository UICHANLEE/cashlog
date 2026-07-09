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
import type { VercelRequest, VercelResponse } from '@vercel/node'

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
}

const ALLOWED = new Set<string>(ALLOWED_LEAF_IDS)
const LOW_CONFIDENCE_THRESHOLD = 0.65

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
    const body = JSON.parse(raw.toString('utf8')) as { imageBase64?: string; mimeType?: string }
    if (!body.imageBase64?.trim()) return null
    return {
      imageBase64: body.imageBase64.trim(),
      mimeType: body.mimeType?.includes('/') ? body.mimeType : 'image/jpeg',
    }
  } catch {
    return null
  }
}

const parseMultipartInput = (raw: Buffer, contentType: string): ImageInput | null => {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1]
  if (!boundary) return null

  const parts = raw.toString('binary').split(`--${boundary}`)
  for (const part of parts) {
    if (!part.includes('name="image"')) continue
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const header = part.slice(0, headerEnd)
    const mimeType = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'image/jpeg'
    const content = part.slice(headerEnd + 4).replace(/\r\n$/, '')
    const fileBuffer = Buffer.from(content, 'binary')
    if (fileBuffer.length === 0) return null
    return {
      imageBase64: fileBuffer.toString('base64'),
      mimeType,
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

const normalizeAnalysis = (raw: Record<string, unknown>): ProductAnalysis => {
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((item) => {
      const row = item as Record<string, unknown>
      const name = String(row.name ?? '').trim()
      const displayName = String(row.display_name ?? row.displayName ?? (name || '상품')).trim()
      const confidence = clamp01(row.confidence)
      const bbox = normalizeBbox(row.bbox)
      return {
        name: name || displayName,
        display_name: displayName,
        category: normalizeLeafId(row.category),
        confidence,
        ...(bbox ? { bbox } : {}),
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

async function analyzeProductImage(input: ImageInput): Promise<ProductAnalysis> {
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const contentType = getHeader(req, 'content-type') ?? ''
    const raw = await readRequestBody(req)
    const input = contentType.includes('multipart/form-data')
      ? parseMultipartInput(raw, contentType)
      : parseJsonInput(raw)

    if (!input) {
      res.status(400).json({ error: 'image 파일 또는 imageBase64가 필요합니다.' })
      return
    }

    const analysis = await analyzeProductImage(input)
    res.status(200).json(analysis)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'SERVER_ERROR'
    res.status(502).json({
      success: false,
      recommended_category: 'misc_uncat',
      confidence: 0,
      reason: message,
      items: [],
      need_user_check: true,
      error_code: 'SERVER_ERROR',
      error: message,
    })
  }
}
