/** 리프(소분류) id — 편한가계부식 대분류·소분류 구조 */
export type CategoryId =
  | 'meal_grocery'
  | 'meal_dining'
  | 'meal_cafe'
  | 'meal_drink'
  | 'life_goods'
  | 'life_appliance'
  | 'life_clean'
  | 'housing_rent'
  | 'housing_fee'
  | 'housing_utility'
  | 'transit_public'
  | 'transit_car'
  | 'transit_maintain'
  | 'comm_internet'
  | 'comm_mobile'
  | 'fashion_clothes'
  | 'fashion_beauty'
  | 'health_med'
  | 'health_gym'
  | 'edu_class'
  | 'edu_book'
  | 'leisure_show'
  | 'leisure_trip'
  | 'leisure_hobby'
  | 'gift_event'
  | 'gift_present'
  | 'finance_insure'
  | 'finance_save'
  | 'finance_fee'
  | 'family_kids'
  | 'family_pet'
  | 'misc_uncat'
  | 'misc_other'

export type CategoryGroupId =
  | 'meal'
  | 'life'
  | 'housing'
  | 'transit'
  | 'comm'
  | 'fashion'
  | 'health'
  | 'edu'
  | 'leisure'
  | 'gift'
  | 'finance'
  | 'family'
  | 'misc'

export type CategoryLeaf = {
  id: CategoryId
  name: string
}

export type CategoryGroup = {
  id: CategoryGroupId
  name: string
  icon: string
  color: string
  leaves: CategoryLeaf[]
}

/** 편한가계부와 비슷한 기본 분류 트리 (MVP용 고정 세트) */
export const categoryTree: CategoryGroup[] = [
  {
    id: 'meal',
    name: '식사',
    icon: '🍚',
    color: '#f97316',
    leaves: [
      { id: 'meal_grocery', name: '식재료' },
      { id: 'meal_dining', name: '외식·배달' },
      { id: 'meal_cafe', name: '카페·디저트' },
      { id: 'meal_drink', name: '술·음료' },
    ],
  },
  {
    id: 'life',
    name: '생활',
    icon: '🧴',
    color: '#059669',
    leaves: [
      { id: 'life_goods', name: '생활용품' },
      { id: 'life_appliance', name: '가전·가구' },
      { id: 'life_clean', name: '세탁·청소' },
    ],
  },
  {
    id: 'housing',
    name: '주거',
    icon: '🏠',
    color: '#0d9488',
    leaves: [
      { id: 'housing_rent', name: '월세·전세' },
      { id: 'housing_fee', name: '관리비' },
      { id: 'housing_utility', name: '공과금' },
    ],
  },
  {
    id: 'transit',
    name: '교통',
    icon: '🚌',
    color: '#2563eb',
    leaves: [
      { id: 'transit_public', name: '대중교통' },
      { id: 'transit_car', name: '택시·주차·유류' },
      { id: 'transit_maintain', name: '자동차유지' },
    ],
  },
  {
    id: 'comm',
    name: '통신',
    icon: '📶',
    color: '#6366f1',
    leaves: [
      { id: 'comm_internet', name: '인터넷·TV' },
      { id: 'comm_mobile', name: '휴대폰' },
    ],
  },
  {
    id: 'fashion',
    name: '의류/미용',
    icon: '👔',
    color: '#db2777',
    leaves: [
      { id: 'fashion_clothes', name: '의류' },
      { id: 'fashion_beauty', name: '미용·화장품' },
    ],
  },
  {
    id: 'health',
    name: '건강',
    icon: '💊',
    color: '#dc2626',
    leaves: [
      { id: 'health_med', name: '약·병원' },
      { id: 'health_gym', name: '운동·헬스' },
    ],
  },
  {
    id: 'edu',
    name: '교육',
    icon: '📚',
    color: '#4f46e5',
    leaves: [
      { id: 'edu_class', name: '학원·강의' },
      { id: 'edu_book', name: '도서·문구' },
    ],
  },
  {
    id: 'leisure',
    name: '문화/여가',
    icon: '🎬',
    color: '#7c3aed',
    leaves: [
      { id: 'leisure_show', name: '영화·공연·전시' },
      { id: 'leisure_trip', name: '여행' },
      { id: 'leisure_hobby', name: '취미' },
    ],
  },
  {
    id: 'gift',
    name: '경조사/선물',
    icon: '🎁',
    color: '#ea580c',
    leaves: [
      { id: 'gift_event', name: '경조사' },
      { id: 'gift_present', name: '선물' },
    ],
  },
  {
    id: 'finance',
    name: '금융/저축',
    icon: '💳',
    color: '#64748b',
    leaves: [
      { id: 'finance_insure', name: '보험' },
      { id: 'finance_save', name: '저축·투자' },
      { id: 'finance_fee', name: '이자·수수료' },
    ],
  },
  {
    id: 'family',
    name: '반려/육아',
    icon: '🍼',
    color: '#ec4899',
    leaves: [
      { id: 'family_kids', name: '육아' },
      { id: 'family_pet', name: '반려동물' },
    ],
  },
  {
    id: 'misc',
    name: '기타',
    icon: '📌',
    color: '#78716c',
    leaves: [
      { id: 'misc_uncat', name: '미분류' },
      { id: 'misc_other', name: '기타' },
    ],
  },
]

/** @deprecated 이전 버전 flat id → 리프 id (localStorage 마이그레이션) */
export const legacyCategoryToLeaf: Record<string, CategoryId> = {
  food: 'meal_dining',
  transport: 'transit_public',
  culture: 'leisure_show',
  shopping: 'life_goods',
  life: 'life_goods',
}

export const migrateCategoryId = (raw: string): CategoryId => {
  if (legacyCategoryToLeaf[raw]) return legacyCategoryToLeaf[raw]
  const exists = categoryTree.some((g) => g.leaves.some((l) => l.id === raw))
  if (exists) return raw as CategoryId
  return 'misc_uncat'
}

export const getCategoryMeta = (categoryId: CategoryId) => {
  for (const group of categoryTree) {
    const leaf = group.leaves.find((item) => item.id === categoryId)
    if (leaf) return { group, leaf }
  }
  const fallback = categoryTree[categoryTree.length - 1]!
  const leaf = fallback.leaves[0]!
  return { group: fallback, leaf }
}

/** 표시용: 「교통 · 대중교통」 */
export const formatCategoryLabel = (categoryId: CategoryId) => {
  const { group, leaf } = getCategoryMeta(categoryId)
  return `${group.name} · ${leaf.name}`
}

export type ExpenseSource = 'photo' | 'manual'

export type Expense = {
  id: string
  dateTime: string
  amount: number
  category: CategoryId
  title: string
  memo: string
  source: ExpenseSource
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

export type DailyLog = {
  date: string
  summary: string
  highlights: string[]
  expenseIds: string[]
  generatedFrom: ExpenseSource[]
}

export type PhotoAnalysis = {
  suggestedAmount: number
  suggestedCategory: CategoryId
  suggestedTitle: string
  suggestedMemo: string
  confidence: number
  rawText: string
}

export type CalendarDay = {
  isoDate: string
  day: number
  inCurrentMonth: boolean
}

export const formatCurrency = (amount: number) =>
  `${new Intl.NumberFormat('ko-KR').format(amount)}원`

export const toIsoDate = (dateTime: string | Date) => {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
  return date.toISOString().slice(0, 10)
}

export const analyzePhoto = async (file: File): Promise<PhotoAnalysis> => {
  const fileName = file.name.toLowerCase()

  if (fileName.includes('subway')) {
    return {
      suggestedAmount: 14200,
      suggestedCategory: 'transit_public',
      suggestedTitle: '이동 기록',
      suggestedMemo: '사진 속 이동 내역을 대중교통으로 분류했어요.',
      confidence: 0.82,
      rawText: '교통 영수증 14,200원',
    }
  }

  if (fileName.includes('taxi')) {
    return {
      suggestedAmount: 14200,
      suggestedCategory: 'transit_car',
      suggestedTitle: '이동 기록',
      suggestedMemo: '사진 속 이동 내역을 택시·주차·유류로 분류했어요.',
      confidence: 0.82,
      rawText: '교통 영수증 14,200원',
    }
  }

  if (fileName.includes('movie') || fileName.includes('gallery')) {
    return {
      suggestedAmount: 18000,
      suggestedCategory: 'leisure_show',
      suggestedTitle: '문화 생활 기록',
      suggestedMemo: '사진 속 장소를 문화·여가 지출로 추천했어요.',
      confidence: 0.84,
      rawText: '전시/영화 18,000원',
    }
  }

  return {
    suggestedAmount: 5200,
    suggestedCategory: 'meal_cafe',
    suggestedTitle: '오늘의 카페 기록',
    suggestedMemo: '사진에서 카페 영수증처럼 보이는 기록을 발견했어요.',
    confidence: 0.88,
    rawText: '카페 영수증 5,200원',
  }
}

export const createExpenseFromAnalysis = ({
  analysis,
  imageUrl,
  dateTime,
}: {
  analysis: PhotoAnalysis
  imageUrl: string
  dateTime: string
}): Expense => {
  const now = new Date().toISOString()

  return {
    id: `expense-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    dateTime,
    amount: analysis.suggestedAmount,
    category: analysis.suggestedCategory,
    title: analysis.suggestedTitle,
    memo: analysis.suggestedMemo,
    source: 'photo',
    imageUrl,
    createdAt: now,
    updatedAt: now,
  }
}

export const createManualExpense = ({
  title,
  amount,
  category,
  memo,
  dateTime,
}: {
  title: string
  amount: number
  category: CategoryId
  memo: string
  dateTime: string
}): Expense => {
  const now = new Date().toISOString()

  return {
    id: `expense-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    dateTime,
    amount,
    category,
    title,
    memo,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  }
}

export const getExpensesForDate = (expenses: Expense[], isoDate: string) =>
  expenses
    .filter((expense) => toIsoDate(expense.dateTime) === isoDate)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))

export const getMonthlyTotal = (expenses: Expense[], yearMonth: string) =>
  expenses
    .filter((expense) => expense.dateTime.startsWith(yearMonth))
    .reduce((sum, expense) => sum + expense.amount, 0)

export const generateDailyLog = (date: string, expenses: Expense[]): DailyLog => {
  const dayExpenses = getExpensesForDate(expenses, date)
  const highlights = dayExpenses.map((expense) => expense.title)
  const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  return {
    date,
    summary:
      dayExpenses.length === 0
        ? '아직 기록이 없어요. 오늘의 사진이나 지출을 남겨보세요.'
        : `오늘은 ${highlights.join(', ')}로 하루가 기록됐어요. 총 ${formatCurrency(
            total,
          )}을 사용했어요.`,
    highlights,
    expenseIds: dayExpenses.map((expense) => expense.id),
    generatedFrom: Array.from(new Set(dayExpenses.map((expense) => expense.source))),
  }
}

export const getCalendarDays = (year: number, month: number): CalendarDay[] => {
  const firstDay = new Date(Date.UTC(year, month, 1))
  const start = new Date(firstDay)
  start.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay())

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)

    return {
      isoDate: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month,
    }
  })
}
