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

/** 소분류 id 목록 — 프롬프트·검증 등에 활용 */
export const allLeafCategoryIds: CategoryId[] = categoryTree.flatMap((g) =>
  g.leaves.map((l) => l.id),
)

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

/** 수입 리프 — 지출 카테고리 id와 완전히 분리됨 */
export type IncomeCategoryId =
  | 'inc_pay_monthly'
  | 'inc_pay_bonus'
  | 'inc_pay_parttime'
  | 'inc_pay_settlement'
  | 'inc_biz_freelance'
  | 'inc_biz_self'
  | 'inc_fin_interest_div'
  | 'inc_refund_tax'
  | 'inc_refund_insurance'
  | 'inc_refund_goods'
  | 'inc_points_cashback'
  | 'inc_gift_allowance'
  | 'inc_gift_event'
  | 'inc_sale_secondhand'
  | 'inc_other_misc'
  | 'inc_uncat'

export type IncomeCategoryGroupId =
  | 'inc_pay'
  | 'inc_biz'
  | 'inc_fin'
  | 'inc_refund'
  | 'inc_points'
  | 'inc_gift'
  | 'inc_misc'

export type IncomeLeaf = {
  id: IncomeCategoryId
  name: string
}

export type IncomeCategoryGroup = {
  id: IncomeCategoryGroupId
  name: string
  icon: string
  color: string
  leaves: IncomeLeaf[]
}

/** 편한가계부식 수입 대·소분류 (지출과 다른 전용 세트) */
export const incomeCategoryTree: IncomeCategoryGroup[] = [
  {
    id: 'inc_pay',
    name: '급여·근로',
    icon: '💼',
    color: '#0d9488',
    leaves: [
      { id: 'inc_pay_monthly', name: '월급·급료' },
      { id: 'inc_pay_bonus', name: '상여·성과금' },
      { id: 'inc_pay_parttime', name: '알바·일용직' },
      { id: 'inc_pay_settlement', name: '퇴직·정산금' },
    ],
  },
  {
    id: 'inc_biz',
    name: '사업·부업',
    icon: '📈',
    color: '#7c3aed',
    leaves: [
      { id: 'inc_biz_freelance', name: '프리랜스' },
      { id: 'inc_biz_self', name: '자영업·매출' },
    ],
  },
  {
    id: 'inc_fin',
    name: '금융소득',
    icon: '🏦',
    color: '#0369a1',
    leaves: [{ id: 'inc_fin_interest_div', name: '이자·배당' }],
  },
  {
    id: 'inc_refund',
    name: '환급·환불',
    icon: '↩️',
    color: '#16a34a',
    leaves: [
      { id: 'inc_refund_tax', name: '세금환급' },
      { id: 'inc_refund_insurance', name: '보험·공제환급' },
      { id: 'inc_refund_goods', name: '상품환불' },
    ],
  },
  {
    id: 'inc_points',
    name: '캐시백·적립',
    icon: '🪙',
    color: '#059669',
    leaves: [{ id: 'inc_points_cashback', name: '캐시백·포인트·마일리지' }],
  },
  {
    id: 'inc_gift',
    name: '선물·받은 돈',
    icon: '🎁',
    color: '#db2777',
    leaves: [
      { id: 'inc_gift_allowance', name: '용돈·지원금' },
      { id: 'inc_gift_event', name: '경조금·축의·조의' },
    ],
  },
  {
    id: 'inc_misc',
    name: '기타수입',
    icon: '📌',
    color: '#78716c',
    leaves: [
      { id: 'inc_sale_secondhand', name: '중고·매각' },
      { id: 'inc_other_misc', name: '잡수입' },
      { id: 'inc_uncat', name: '미분류' },
    ],
  },
]

export const allIncomeLeafCategoryIds: IncomeCategoryId[] = incomeCategoryTree.flatMap((g) =>
  g.leaves.map((l) => l.id),
)

export function isIncomeLeafId(raw: string): raw is IncomeCategoryId {
  return allIncomeLeafCategoryIds.includes(raw as IncomeCategoryId)
}

/** 구버전: 수입에 지출 카테고리만 있던 경우 미분류로 옮김 */
export function migrateIncomeCategoryId(raw: string): IncomeCategoryId {
  if (isIncomeLeafId(raw)) return raw as IncomeCategoryId
  return 'inc_uncat'
}

export const getIncomeCategoryMeta = (categoryId: IncomeCategoryId) => {
  for (const group of incomeCategoryTree) {
    const leaf = group.leaves.find((item) => item.id === categoryId)
    if (leaf) return { group, leaf }
  }
  const fallback = incomeCategoryTree[incomeCategoryTree.length - 1]!
  const leaf = fallback.leaves[fallback.leaves.length - 1]!
  return { group: fallback, leaf }
}

export function formatIncomeCategoryLabel(categoryId: IncomeCategoryId) {
  const { group, leaf } = getIncomeCategoryMeta(categoryId)
  return `${group.name} · ${leaf.name}`
}

/** 지출|수입 카테고리 id (항목 종류별로 다른 트리) */
export type LedgerCategoryId = CategoryId | IncomeCategoryId

export type ExpenseSource = 'photo' | 'manual'

export type LedgerKind = 'expense' | 'income'

export type Expense = {
  id: string
  dateTime: string
  /** 항상 0 초과 원 단위 금액 (수입도 양수) */
  amount: number
  kind: LedgerKind
  category: LedgerCategoryId
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
  /** 어떤 엔진이 채웠는지(UI 표시용, 선택) */
  engine?: 'mock' | 'openai'
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

/** 같은 dateTime일 때 더 먼저 입력된 항목(createdAt↑)이 앞에 오도록 */
export function compareExpensesChronological(a: Expense, b: Expense): number {
  const byDt = a.dateTime.localeCompare(b.dateTime)
  if (byDt !== 0) return byDt
  const ca = (a.createdAt ?? a.updatedAt ?? a.dateTime).toString()
  const cb = (b.createdAt ?? b.updatedAt ?? b.dateTime).toString()
  const bySaved = ca.localeCompare(cb)
  if (bySaved !== 0) return bySaved
  return a.id.localeCompare(b.id)
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
    kind: 'expense',
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
  kind = 'expense',
}: {
  title: string
  amount: number
  category: LedgerCategoryId
  memo: string
  dateTime: string
  kind?: LedgerKind
}): Expense => {
  const now = new Date().toISOString()

  return {
    id: `expense-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    dateTime,
    amount,
    kind,
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
    .sort(compareExpensesChronological)

/** 사진 지출만, 이미지 URL 있는 것만 시간순 */
export const getPhotoExpensesForDate = (expenses: Expense[], isoDate: string) =>
  getExpensesForDate(expenses, isoDate).filter(
    (e) => e.source === 'photo' && Boolean(e.imageUrl?.trim()),
  )

/** 스토리: 해당 일 모든 기록(직접 입력·사진)·시간순 */
export const getStoryEntriesForDate = (expenses: Expense[], isoDate: string): Expense[] =>
  getExpensesForDate(expenses, isoDate)

/** 해당 월(YYYY-MM) 전체 스토리 항목·시간순 */
export const getStoryEntriesForMonth = (
  expenses: Expense[],
  yearMonth: string,
): Expense[] =>
  [...expenses]
    .filter((e) => toIsoDate(e.dateTime).startsWith(yearMonth))
    .sort(compareExpensesChronological)

/** 해당 월(YYYY-MM) 전체에서 사진 지출 시간순 */
export const getPhotoExpensesForMonth = (
  expenses: Expense[],
  yearMonth: string,
): Expense[] =>
  [...expenses]
    .filter(
      (e) =>
        e.source === 'photo' &&
        Boolean(e.imageUrl?.trim()) &&
        toIsoDate(e.dateTime).startsWith(yearMonth),
    )
    .sort(compareExpensesChronological)

/** 해당 월 지출만 합 (수입 미포함) */
export const getMonthlyExpenseTotal = (expenses: Expense[], yearMonth: string) =>
  expenses
    .filter(
      (e) => e.dateTime.startsWith(yearMonth) && e.kind !== 'income',
    )
    .reduce((sum, e) => sum + e.amount, 0)

/** 해당 월 수입 합 */
export const getMonthlyIncomeTotal = (expenses: Expense[], yearMonth: string) =>
  expenses
    .filter((e) => e.dateTime.startsWith(yearMonth) && e.kind === 'income')
    .reduce((sum, e) => sum + e.amount, 0)

/** @deprecated 과거 이름 — 지출 합계와 동일 */
export const getMonthlyTotal = (expenses: Expense[], yearMonth: string) =>
  getMonthlyExpenseTotal(expenses, yearMonth)

export const dayExpenseTotal = (dayItems: Expense[]) =>
  dayItems.filter((e) => e.kind !== 'income').reduce((sum, e) => sum + e.amount, 0)

export const dayIncomeTotal = (dayItems: Expense[]) =>
  dayItems.filter((e) => e.kind === 'income').reduce((sum, e) => sum + e.amount, 0)

export const generateDailyLog = (date: string, expenses: Expense[]): DailyLog => {
  const dayExpenses = getExpensesForDate(expenses, date)
  const highlights = dayExpenses.map((expense) => expense.title)
  const spent = dayExpenseTotal(dayExpenses)
  const earned = dayIncomeTotal(dayExpenses)

  let summaryBody: string
  if (dayExpenses.length === 0) {
    summaryBody = '아직 기록이 없어요. 오늘의 사진이나 수입·지출을 남겨보세요.'
  } else {
    const parts: string[] = []
    parts.push(`${highlights.join(', ')}로 하루가 기록됐어요.`)
    if (spent > 0) parts.push(`지출 ${formatCurrency(spent)}.`)
    if (earned > 0) parts.push(`수입 ${formatCurrency(earned)}.`)
    summaryBody = parts.join(' ')
  }

  return {
    date,
    summary: summaryBody,
    highlights,
    expenseIds: dayExpenses.map((expense) => expense.id),
    generatedFrom: Array.from(new Set(dayExpenses.map((expense) => expense.source))),
  }
}

/** 카드 UI·타임라인 헤더용 줄 (수입 전용 카테고리 라벨) */
export function formatLedgerCategory(expense: Expense): string {
  if (expense.kind === 'income') {
    return formatIncomeCategoryLabel(expense.category as IncomeCategoryId)
  }
  return formatCategoryLabel(expense.category as CategoryId)
}

export function ledgerAccentColor(expense: Expense): string {
  if (expense.kind === 'income') {
    return getIncomeCategoryMeta(expense.category as IncomeCategoryId).group.color
  }
  return getCategoryMeta(expense.category as CategoryId).group.color
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
