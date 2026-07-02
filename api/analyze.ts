/**
 * Vercel Serverless — compact Vision/OCR analyzer
 * 영수증·결제 화면·사진/영상 포스터 프레임 → 지출 추천 JSON
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

type VisionModelPresetId = 'openai-mini' | 'qwen25vl3b-hf' | 'qwen25vl3b-local'

type VisionModelConfig = {
  apiBase: string
  envKey: 'OPENAI_API_KEY' | 'HF_TOKEN' | 'VISION_API_KEY'
  model: string
  engine: string
  description: string
}

const MODEL_PRESETS: Record<VisionModelPresetId, VisionModelConfig> = {
  'openai-mini': {
    apiBase: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    engine: 'openai',
    description: 'Hosted OpenAI compact vision model',
  },
  'qwen25vl3b-hf': {
    apiBase: 'https://router.huggingface.co/v1',
    envKey: 'HF_TOKEN',
    model: 'Qwen/Qwen2.5-VL-3B-Instruct',
    engine: 'qwen',
    description: 'Qwen2.5-VL 3B through Hugging Face Inference Providers',
  },
  'qwen25vl3b-local': {
    apiBase: 'http://127.0.0.1:8000/v1',
    envKey: 'VISION_API_KEY',
    model: 'Qwen/Qwen2.5-VL-3B-Instruct',
    engine: 'qwen',
    description: 'Qwen2.5-VL 3B served by local vLLM/SGLang',
  },
}

function isVisionModelPresetId(raw: string): raw is VisionModelPresetId {
  return raw in MODEL_PRESETS
}

function getVisionModelConfig(): VisionModelConfig {
  const presetRaw = process.env.VISION_MODEL_PRESET?.trim() || 'openai-mini'
  const preset = isVisionModelPresetId(presetRaw) ? MODEL_PRESETS[presetRaw] : MODEL_PRESETS['openai-mini']
  const model =
    process.env.VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    preset.model
  const apiBase = (process.env.VISION_API_BASE_URL?.trim() || preset.apiBase).replace(/\/$/, '')
  const engine =
    process.env.VISION_ENGINE?.trim() ||
    (model.toLowerCase().includes('qwen') ? 'qwen' : preset.engine)
  const envKey = process.env.VISION_API_KEY ? 'VISION_API_KEY' : preset.envKey

  return {
    ...preset,
    apiBase,
    envKey,
    model,
    engine,
  }
}

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
): Promise<{ json: Record<string, unknown>; model: string; engine: string }> {
  const modelConfig = getVisionModelConfig()
  const key = process.env.VISION_API_KEY || process.env[modelConfig.envKey] || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error(
      `${modelConfig.envKey} is not configured for ${modelConfig.description}. Set VISION_API_KEY to override.`,
    )
  }

  const { apiBase, model, engine } = modelConfig

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
- rawText: 이미지에서 읽은 핵심 텍스트를 한 줄로 (없으면 추정 근거 한 줄)
- ocrText: OCR로 읽은 원문에 가까운 텍스트. 없으면 빈 문자열
- detectedObjects: 피사체·장소·브랜드·상품 단서를 문자열 배열로 최대 8개
- categoryReason: 이 카테고리를 고른 이유 한 문장

분류 기준:
- 영수증/결제 화면이면 OCR 금액과 상호명을 우선한다.
- 일반 사진이면 피사체·장소·브랜드 단서로 지출 카테고리를 추론한다.
- 확신이 낮으면 misc_uncat 대신 가장 가까운 생활 카테고리를 고르고 confidence를 낮춘다.`

  const safeMime = mimeType?.includes('/') ? mimeType : 'image/jpeg'
  const dataUrl = `data:${safeMime};base64,${imageBase64}`

  const res = await fetch(`${apiBase}/chat/completions`, {
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
    throw new Error(raw.slice(0, 500) || `Vision HTTP ${res.status}`)
  }

  let parsed: { choices?: { message?: { content?: string } }[] }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    throw new Error('Vision 응답 파싱 실패')
  }

  const content = parsed.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Vision 응답에 내용이 없습니다')
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error('모델이 JSON 형식으로 답하지 않았습니다')
  }

  return { json, model, engine }
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

    const analyzed = await visionToAnalysis(imageBase64.trim(), mimeType)
    const { json, model, engine } = analyzed

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
      ocrText:
        typeof json.ocrText === 'string' && json.ocrText.trim()
          ? json.ocrText.trim().slice(0, 2000)
          : typeof json.rawText === 'string'
            ? json.rawText.trim().slice(0, 2000)
            : '',
      detectedObjects: Array.isArray(json.detectedObjects)
        ? json.detectedObjects
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      categoryReason:
        typeof json.categoryReason === 'string' && json.categoryReason.trim()
          ? json.categoryReason.trim().slice(0, 200)
          : '이미지 속 텍스트와 피사체 단서를 함께 봤어요.',
      engine,
      model,
    }

    res.status(200).json(out)
  } catch (e) {
    const message = e instanceof Error ? e.message : '서버 오류'
    res.status(502).json({ error: message })
  }
}
