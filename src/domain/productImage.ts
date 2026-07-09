import type { CategoryId } from './cashlog'

export type ProductDetectionErrorCode =
  | 'NO_OBJECT_DETECTED'
  | 'LOW_CONFIDENCE'
  | 'MULTI_CATEGORY_DETECTED'
  | 'SERVER_ERROR'

export type BoundingBox = [number, number, number, number]

export type ProductCategoryCandidate = {
  category: CategoryId
  confidence: number
}

export type DetectedProductItem = {
  name: string
  displayName: string
  category: CategoryId
  confidence: number
  bbox?: BoundingBox
  topCategories?: ProductCategoryCandidate[]
}

export type ProductImageAnalysisResult = {
  success: boolean
  recommendedCategory: CategoryId
  confidence: number
  reason: string
  items: DetectedProductItem[]
  needUserCheck: boolean
  errorCode?: ProductDetectionErrorCode
}

export type CategoryFeedbackPayload = {
  expenseId: string
  modelCategory: CategoryId
  userCategory: CategoryId
  confidence?: number
  itemKeyword?: string
}

export type ProductCategoryRule = {
  keywords: string[]
  category: CategoryId
}

export const LOW_CONFIDENCE_THRESHOLD = 0.65

export const productCategoryRules: ProductCategoryRule[] = [
  {
    keywords: ['도시락', '김밥', '샌드위치', '라면', '식사', 'meal', 'lunch', 'food'],
    category: 'meal_dining',
  },
  {
    keywords: ['커피', '디저트', '빵', '과자', '아이스크림', 'coffee', 'dessert', 'snack'],
    category: 'meal_cafe',
  },
  {
    keywords: ['세제', '휴지', '물티슈', '샴푸', '치약', 'cleaner', 'tissue', 'shampoo'],
    category: 'life_goods',
  },
  {
    keywords: ['티셔츠', '바지', '신발', '가방', '모자', 'shirt', 'shoes', 'bag'],
    category: 'fashion_clothes',
  },
  {
    keywords: ['이어폰', '충전기', '키보드', '마우스', '보조배터리', 'charger', 'keyboard'],
    category: 'life_appliance',
  },
  {
    keywords: ['책', '노트', '필기구', '학습', 'book', 'notebook', 'stationery'],
    category: 'edu_book',
  },
  {
    keywords: ['교통카드', '주유', '차량', 'transport', 'gasoline'],
    category: 'transit_public',
  },
  {
    keywords: ['약', '마스크', '비타민', '파스', 'medicine', 'mask', 'vitamin'],
    category: 'health_med',
  },
  {
    keywords: ['화장품', '향수', '스킨케어', '헤어', 'cosmetic', 'perfume'],
    category: 'fashion_beauty',
  },
  {
    keywords: ['운동용품', '게임', '악기', '굿즈', 'hobby', 'game', 'sports'],
    category: 'leisure_hobby',
  },
  {
    keywords: ['꽃', '기념품', '선물세트', '포장', 'flower', 'gift'],
    category: 'gift_present',
  },
]

export const mapProductKeywordToCategory = (keyword: string): CategoryId => {
  const normalized = keyword.toLowerCase()
  const matched = productCategoryRules.find((rule) =>
    rule.keywords.some((candidate) => normalized.includes(candidate.toLowerCase())),
  )
  return matched?.category ?? 'misc_uncat'
}

const confidence = (raw: unknown): number => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const category = (raw: unknown, fallbackKeyword = ''): CategoryId =>
  typeof raw === 'string' && raw ? (raw as CategoryId) : mapProductKeywordToCategory(fallbackKeyword)

const bbox = (raw: unknown): BoundingBox | undefined => {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined
  const values = raw.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return undefined
  return values as BoundingBox
}

export const normalizeProductImageAnalysis = (raw: unknown): ProductImageAnalysisResult => {
  const input = (raw ?? {}) as Record<string, unknown>
  const rawItems = Array.isArray(input.items) ? input.items : []
  const items: DetectedProductItem[] = rawItems
    .map((item) => {
      const row = item as Record<string, unknown>
      const name = String(row.name ?? row.item_name ?? '').trim()
      const displayName = String(row.display_name ?? row.displayName ?? (name || '상품')).trim()
      const itemCategory = category(row.category ?? row.predicted_category, `${name} ${displayName}`)
      return {
        name: name || displayName,
        displayName,
        category: itemCategory,
        confidence: confidence(row.confidence),
        ...(bbox(row.bbox) ? { bbox: bbox(row.bbox) } : {}),
      }
    })
    .filter((item) => item.name || item.displayName)

  const recommendedCategory = category(
    input.recommended_category ?? input.recommendedCategory,
    items.map((item) => item.name).join(' '),
  )
  const resultConfidence = confidence(input.confidence)
  const errorCode =
    typeof input.error_code === 'string'
      ? (input.error_code as ProductDetectionErrorCode)
      : typeof input.errorCode === 'string'
        ? (input.errorCode as ProductDetectionErrorCode)
        : undefined

  return {
    success: Boolean(input.success ?? items.length > 0),
    recommendedCategory,
    confidence: resultConfidence,
    reason: String(input.reason ?? '상품 사진 기반으로 카테고리를 추천했어요.'),
    items,
    needUserCheck: Boolean(input.need_user_check ?? input.needUserCheck) || resultConfidence < LOW_CONFIDENCE_THRESHOLD,
    ...(errorCode ? { errorCode } : {}),
  }
}
