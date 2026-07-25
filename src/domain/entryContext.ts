import { compareExpensesChronological, type Expense } from './cashlog'

export type DayPartId = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

export type DayPart = {
  id: DayPartId
  label: string
  rangeLabel: string
  icon: string
  startHour: number
  endHour: number
}

export const dayParts: DayPart[] = [
  { id: 'dawn', label: '새벽', rangeLabel: '00–05시', icon: '🌙', startHour: 0, endHour: 5 },
  { id: 'morning', label: '아침', rangeLabel: '05–11시', icon: '🌤️', startHour: 5, endHour: 11 },
  { id: 'afternoon', label: '낮', rangeLabel: '11–17시', icon: '☀️', startHour: 11, endHour: 17 },
  { id: 'evening', label: '저녁', rangeLabel: '17–22시', icon: '🌆', startHour: 17, endHour: 22 },
  { id: 'night', label: '밤', rangeLabel: '22–24시', icon: '✨', startHour: 22, endHour: 24 },
]

function dateTimeParts(dateTime: string, timeZone?: string) {
  const date = new Date(dateTime)
  if (Number.isNaN(date.getTime())) return null

  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date)
      const hour = Number(parts.find((part) => part.type === 'hour')?.value)
      const minute = Number(parts.find((part) => part.type === 'minute')?.value)
      if (Number.isFinite(hour) && Number.isFinite(minute)) return { hour, minute }
    } catch {
      // Fall back to the current device zone for an invalid or unavailable IANA zone.
    }
  }

  return { hour: date.getHours(), minute: date.getMinutes() }
}

export function getDayPart(dateTime: string, timeZone?: string): DayPart {
  const hour = dateTimeParts(dateTime, timeZone)?.hour ?? 12
  return (
    dayParts.find((part) => hour >= part.startHour && hour < part.endHour) ??
    dayParts[2]
  )
}

export function formatExpenseClock(dateTime: string, timeZone?: string): string {
  const parts = dateTimeParts(dateTime, timeZone)
  if (!parts) return '--:--'
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

export function clockFromDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return '12:00'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function combineLocalDateAndTime(localDate: string, time: string): string {
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? time : '12:00'
  const date = new Date(`${localDate}T${normalizedTime}:00`)
  return Number.isNaN(date.getTime())
    ? new Date(`${localDate}T12:00:00`).toISOString()
    : date.toISOString()
}

export type DayPartExpenseGroup = {
  part: DayPart
  expenses: Expense[]
  spent: number
  earned: number
}

export function groupExpensesByDayPart(expenses: Expense[]): DayPartExpenseGroup[] {
  const groups = new Map<DayPartId, Expense[]>()
  for (const expense of [...expenses].sort(compareExpensesChronological)) {
    const part = getDayPart(expense.dateTime, expense.timeZone)
    groups.set(part.id, [...(groups.get(part.id) ?? []), expense])
  }

  return dayParts.flatMap((part) => {
    const groupedExpenses = groups.get(part.id)
    if (!groupedExpenses?.length) return []
    return [{
      part,
      expenses: groupedExpenses,
      spent: groupedExpenses
        .filter((expense) => expense.kind === 'expense')
        .reduce((sum, expense) => sum + expense.amount, 0),
      earned: groupedExpenses
        .filter((expense) => expense.kind === 'income')
        .reduce((sum, expense) => sum + expense.amount, 0),
    }]
  })
}

export function dominantDayPart(expenses: Expense[]): DayPart | undefined {
  return groupExpensesByDayPart(expenses)
    .sort((a, b) => {
      const amountDifference = b.spent - a.spent
      return amountDifference || b.expenses.length - a.expenses.length
    })[0]?.part
}
