import { getCategoryMeta, migrateCategoryId, type CategoryGroupId, type CategoryId } from './cashlog'

export type ProductDetectionErrorCode =
  | 'NO_OBJECT_DETECTED'
  | 'LOW_CONFIDENCE'
  | 'MULTI_CATEGORY_DETECTED'
  | 'SERVER_ERROR'

export type BoundingBox = [number, number, number, number]

export type ProductCategoryCandidate = {
  category: CategoryId
  groupId?: CategoryGroupId
  confidence: number
  rank?: 1 | 2 | 3
}

export type ProductAnalysisStatus = 'provisional' | 'final'
export type ProductDecisionMode = 'auto_select' | 'show_top3' | 'manual_select' | 'retake'
export type ProductVerificationState = 'queued' | 'running' | 'completed' | 'failed'

export type ProductEvidence = {
  context: string[]
  appearance: string[]
  ocr?: string[]
  barcode?: string[]
}

export type DetectedProductItem = {
  productId?: string
  name: string
  displayName: string
  category: CategoryId
  confidence: number
  bbox?: BoundingBox
  topCategories?: ProductCategoryCandidate[]
  evidence?: ProductEvidence
}

export type ProductImageAnalysisResult = {
  requestId?: string
  status: ProductAnalysisStatus
  revision: number
  success: boolean
  recommendedCategory: CategoryId
  confidence: number
  reason: string
  items: DetectedProductItem[]
  needUserCheck: boolean
  errorCode?: ProductDetectionErrorCode
  decision: {
    mode: ProductDecisionMode
    requiresUserConfirmation: boolean
  }
  verification: { state: ProductVerificationState }
  modelVersions: Record<string, string>
  taxonomyVersion: string
}

export type ProductAnalysisRevision = ProductImageAnalysisResult & {
  event: 'analysis_revision'
  changed: boolean
  reason?: string
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
  typeof raw === 'string' && raw ? migrateCategoryId(raw) : mapProductKeywordToCategory(fallbackKeyword)

const bbox = (raw: unknown): BoundingBox | undefined => {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined
  const values = raw.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return undefined
  return values as BoundingBox
}

const topCategories = (raw: unknown, primary: CategoryId, primaryConfidence: number): ProductCategoryCandidate[] => {
  const source = Array.isArray(raw) ? raw : []
  const values = source
    .map((candidate) => {
      const row = candidate as Record<string, unknown>
      return {
        category: category(row.leaf_id ?? row.category),
        confidence: confidence(row.confidence),
      }
    })
    .filter((candidate) => candidate.confidence > 0)
  if (!values.some((candidate) => candidate.category === primary)) {
    values.push({ category: primary, confidence: primaryConfidence })
  }
  const unique = [...new Map(values.map((candidate) => [candidate.category, candidate])).values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
  for (const fallback of ['misc_uncat', 'misc_other', 'meal_grocery'] as CategoryId[]) {
    if (unique.length >= 3) break
    if (!unique.some((candidate) => candidate.category === fallback)) {
      unique.push({ category: fallback, confidence: 0 })
    }
  }
  const total = unique.reduce((sum, candidate) => sum + candidate.confidence, 0)
  return unique.map((candidate, index) => ({
    ...candidate,
    confidence: total > 0 ? candidate.confidence / total : index === 0 ? 1 : 0,
    groupId: getCategoryMeta(candidate.category).group.id,
    rank: (index + 1) as 1 | 2 | 3,
  }))
}

export const normalizeProductImageAnalysis = (raw: unknown): ProductImageAnalysisResult => {
  const input = (raw ?? {}) as Record<string, unknown>
  const rawItems = Array.isArray(input.products)
    ? input.products
    : Array.isArray(input.items)
      ? input.items
      : []
  const items: DetectedProductItem[] = rawItems
    .map((item) => {
      const row = item as Record<string, unknown>
      const name = String(row.name ?? row.item_name ?? row.display_name ?? '').trim()
      const displayName = String(row.display_name ?? row.displayName ?? (name || '상품')).trim()
      const rawCandidates = row.candidates ?? row.top_categories ?? row.topCategories
      const firstCandidate = Array.isArray(rawCandidates)
        ? (rawCandidates[0] as Record<string, unknown> | undefined)
        : undefined
      const itemCategory = category(
        firstCandidate?.leaf_id ?? firstCandidate?.category ?? row.category ?? row.predicted_category,
        `${name} ${displayName}`,
      )
      const itemConfidence = confidence(firstCandidate?.confidence ?? row.confidence)
      const itemTopCategories = topCategories(rawCandidates, itemCategory, itemConfidence)
      const rawEvidence = (row.evidence ?? {}) as Record<string, unknown>
      const stringList = (value: unknown) =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      return {
        productId: String(row.product_id ?? '').trim() || undefined,
        name: name || displayName,
        displayName,
        category: itemCategory,
        confidence: itemTopCategories[0]?.confidence ?? itemConfidence,
        ...(bbox(row.bbox) ? { bbox: bbox(row.bbox) } : {}),
        topCategories: itemTopCategories,
        evidence: {
          context: stringList(rawEvidence.context),
          appearance: stringList(rawEvidence.appearance),
          ...(stringList(rawEvidence.ocr).length ? { ocr: stringList(rawEvidence.ocr) } : {}),
          ...(stringList(rawEvidence.barcode).length ? { barcode: stringList(rawEvidence.barcode) } : {}),
        },
      }
    })
    .filter((item) => item.name || item.displayName)

  const recommendedCategory = category(
    input.recommended_category ?? input.recommendedCategory,
    items.map((item) => item.name).join(' '),
  )
  const resultConfidence = confidence(input.confidence ?? items[0]?.confidence)
  const status: ProductAnalysisStatus = input.status === 'provisional' ? 'provisional' : 'final'
  const rawDecision = (input.decision ?? {}) as Record<string, unknown>
  const rawVerification = (input.verification ?? {}) as Record<string, unknown>
  const requiresUserConfirmation =
    Boolean(rawDecision.requires_user_confirmation ?? rawDecision.requiresUserConfirmation) ||
    resultConfidence < LOW_CONFIDENCE_THRESHOLD
  const mode = String(rawDecision.mode ?? (requiresUserConfirmation ? 'show_top3' : 'auto_select')) as ProductDecisionMode
  const errorCode =
    typeof input.error_code === 'string'
      ? (input.error_code as ProductDetectionErrorCode)
      : typeof input.errorCode === 'string'
        ? (input.errorCode as ProductDetectionErrorCode)
        : undefined

  return {
    requestId: String(input.request_id ?? input.requestId ?? '').trim() || undefined,
    status,
    revision: Math.max(0, Math.floor(Number(input.revision) || 0)),
    success: Boolean(input.success ?? items.length > 0),
    recommendedCategory,
    confidence: resultConfidence,
    reason: String(input.reason ?? '상품 사진 기반으로 카테고리를 추천했어요.'),
    items,
    needUserCheck: Boolean(input.need_user_check ?? input.needUserCheck) || resultConfidence < LOW_CONFIDENCE_THRESHOLD,
    ...(errorCode ? { errorCode } : {}),
    decision: { mode, requiresUserConfirmation },
    verification: {
      state: String(rawVerification.state ?? (status === 'provisional' ? 'queued' : 'completed')) as ProductVerificationState,
    },
    modelVersions: (input.model_versions ?? input.modelVersions ?? {}) as Record<string, string>,
    taxonomyVersion: String(input.taxonomy_version ?? input.taxonomyVersion ?? '13.33.1'),
  }
}

export const applyProductAnalysisRevision = ({
  current,
  revision,
  userEditedCategory,
}: {
  current: ProductImageAnalysisResult
  revision: ProductAnalysisRevision
  userEditedCategory?: CategoryId
}): ProductImageAnalysisResult => {
  if (revision.requestId !== current.requestId || revision.revision <= current.revision) return current
  if (!userEditedCategory) return revision
  return {
    ...revision,
    recommendedCategory: userEditedCategory,
    needUserCheck: false,
    decision: { mode: 'auto_select', requiresUserConfirmation: false },
  }
}
