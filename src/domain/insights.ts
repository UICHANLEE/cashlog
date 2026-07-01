import {
  type CategoryGroupId,
  type CategoryId,
  type Expense,
  getCategoryMeta,
  toIsoDate,
} from './cashlog'

export type CategoryLeafTotal = {
  leafId: CategoryId
  label: string
  groupName: string
  color: string
  total: number
  ratio: number
}

export type MonthBucket = {
  yearMonth: string
  label: string
  expense: number
  income: number
}

const monthLabel = (yearMonth: string): string => {
  const [year, month] = yearMonth.split('-')
  return `${year.slice(2)}.${month}`
}

const isExpense = (e: Expense) => e.kind !== 'income'

const inMonth = (e: Expense, yearMonth: string) =>
  toIsoDate(e.dateTime).startsWith(yearMonth)

/** 데이터가 있는 모든 월(YYYY-MM)을 최신순으로 반환 */
export const listAvailableMonths = (expenses: Expense[]): string[] => {
  const set = new Set<string>()
  for (const e of expenses) set.add(toIsoDate(e.dateTime).slice(0, 7))
  return [...set].sort((a, b) => b.localeCompare(a))
}

/** 해당 월의 소분류별 지출 합계 (내림차순) */
export const getCategoryLeafTotals = (
  expenses: Expense[],
  yearMonth: string,
): CategoryLeafTotal[] => {
  const totals = new Map<CategoryId, number>()
  for (const e of expenses) {
    if (!isExpense(e) || !inMonth(e, yearMonth)) continue
    const id = e.category as CategoryId
    totals.set(id, (totals.get(id) ?? 0) + e.amount)
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([leafId, total]) => {
      const { group, leaf } = getCategoryMeta(leafId)
      return {
        leafId,
        label: leaf.name,
        groupName: group.name,
        color: group.color,
        total,
        ratio: sum > 0 ? total / sum : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** 해당 월의 대분류별 지출 합계 (카드 적립 계산용) */
export const getCategoryGroupTotals = (
  expenses: Expense[],
  yearMonth: string,
): Record<CategoryGroupId, number> => {
  const totals = {} as Record<CategoryGroupId, number>
  for (const e of expenses) {
    if (!isExpense(e) || !inMonth(e, yearMonth)) continue
    const { group } = getCategoryMeta(e.category as CategoryId)
    totals[group.id] = (totals[group.id] ?? 0) + e.amount
  }
  return totals
}

/** 여러 월의 지출·수입 버킷 (오래된 → 최신 순) */
export const getMonthBuckets = (
  expenses: Expense[],
  yearMonths: string[],
): MonthBucket[] =>
  [...yearMonths]
    .sort((a, b) => a.localeCompare(b))
    .map((yearMonth) => {
      let expense = 0
      let income = 0
      for (const e of expenses) {
        if (!inMonth(e, yearMonth)) continue
        if (e.kind === 'income') income += e.amount
        else expense += e.amount
      }
      return { yearMonth, label: monthLabel(yearMonth), expense, income }
    })
