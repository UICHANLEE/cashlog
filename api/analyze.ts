/**
 * Vercel Serverless — OpenAI Vision (영수증·결제 화면 이미지 → 지출 추천 JSON)
 *
 * 클라이언트는 여기로 base64만 보냄. API 키는 Vercel 환경변수 OPENAI_API_KEY.
 *
 * 카테고리 id는 프론트 `src/domain/cashlog.ts` 의 소분류 id와 반드시 동기화할 것.
 */
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

const ALLOWED = new Set<string>(ALLOWED_LEAF_IDS)

function normalizeLeafId(raw: unknown): LeafId {
  if (typeof raw !== 'string' || !ALLOWED.has(raw)) return 'misc_uncat'
  return raw as LeafId
}

function coerceAmount(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(String(raw).replace(/[,원\s]/g, ''))
        : NaN
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

async function visionToAnalysis(
  imageBase64: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const model =
    process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'

  const leafList = ALLOWED_LEAF_IDS.join(', ')
  const system = `당신은 한국 가계부 앱 Cashlog 의 영수증 분석기입니다.
이미지에서 총 지출 금액(숫자)과 가장 맞는 지출 카테고리를 추론합니다.
반드시 JSON 한 객체만 출력하세요. 코드펜스·설명 금지.

필수 키:
- suggestedAmount: 양의 정수(원)
- suggestedCategory: 아래 id 중 정확히 하나만 — [${leafList}]
- suggestedTitle: 짧은 한글 제목 (20자 이내)
- suggestedMemo: 사용자에게 보여 줄 한 줄 설명 (부가세·할인 등 있으면 언급)
- confidence: 0~1 사이 실수
- rawText: 이미지에서 읽은 핵심 텍스트를 한 줄로 (없으면 추정 근거 한 줄)`

  const safeMime = mimeType?.includes('/') ? mimeType : 'image/jpeg'
  const dataUrl = `data:${safeMime};base64,${imageBase64}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '이 이미지를 분석해서 위 스키마의 JSON만 반환해 주세요.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'low' },
            },
          ],
        },
      ],
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(raw.slice(0, 500) || `OpenAI HTTP ${res.status}`)
  }

  let parsed: { choices?: { message?: { content?: string } }[] }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    throw new Error('OpenAI 응답 파싱 실패')
  }

  const content = parsed.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI 응답에 내용이 없습니다')
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error('모델이 JSON 형식으로 답하지 않았습니다')
  }

  return json
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const body = req.body as { imageBase64?: string; mimeType?: string } | undefined
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg'

    if (!imageBase64.trim()) {
      res.status(400).json({ error: 'imageBase64가 필요합니다' })
      return
    }

    const json = await visionToAnalysis(imageBase64.trim(), mimeType)

    const amount = coerceAmount(json.suggestedAmount)
    if (amount <= 0) {
      res.status(422).json({ error: '금액을 인식하지 못했습니다. 사진을 더 밝게 찍어 주세요.' })
      return
    }

    const out = {
      suggestedAmount: amount,
      suggestedCategory: normalizeLeafId(json.suggestedCategory),
      suggestedTitle:
        typeof json.suggestedTitle === 'string' && json.suggestedTitle.trim()
          ? json.suggestedTitle.trim().slice(0, 80)
          : '지출 기록',
      suggestedMemo:
        typeof json.suggestedMemo === 'string' && json.suggestedMemo.trim()
          ? json.suggestedMemo.trim().slice(0, 200)
          : '이미지 기반으로 분류했어요.',
      confidence: clamp01(Number(json.confidence)),
      rawText:
        typeof json.rawText === 'string' && json.rawText.trim()
          ? json.rawText.trim().slice(0, 300)
          : '이미지 분석',
      engine: 'openai' as const,
    }

    res.status(200).json(out)
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류'
    res.status(502).json({ error: message })
  }
}
