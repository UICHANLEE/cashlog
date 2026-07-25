import { describe, expect, it } from 'vitest'
import { createManualExpense } from './cashlog'
import {
  combineLocalDateAndTime,
  dominantDayPart,
  formatExpenseClock,
  getDayPart,
  groupExpensesByDayPart,
} from './entryContext'

describe('entry context', () => {
  it('classifies a stored instant in its original time zone', () => {
    expect(getDayPart('2026-07-26T00:30:00.000Z', 'Asia/Seoul').id).toBe('morning')
    expect(formatExpenseClock('2026-07-26T00:30:00.000Z', 'Asia/Seoul')).toBe('09:30')
  })

  it('combines the selected local day and clock into a valid instant', () => {
    const dateTime = combineLocalDateAndTime('2026-07-26', '08:15')
    const date = new Date(dateTime)

    expect(Number.isNaN(date.getTime())).toBe(false)
    expect(date.getHours()).toBe(8)
    expect(date.getMinutes()).toBe(15)
  })

  it('groups records by day part and finds the highest-spend period', () => {
    const morning = {
      ...createManualExpense({
        title: '아침 커피',
        amount: 5000,
        category: 'meal_cafe',
        memo: '',
        dateTime: '2026-07-26T00:00:00.000Z',
      }),
      timeZone: 'Asia/Seoul',
    }
    const evening = {
      ...createManualExpense({
        title: '저녁 식사',
        amount: 30000,
        category: 'meal_dining',
        memo: '',
        dateTime: '2026-07-26T10:30:00.000Z',
      }),
      timeZone: 'Asia/Seoul',
    }

    const groups = groupExpensesByDayPart([evening, morning])

    expect(groups.map((group) => group.part.id)).toEqual(['morning', 'evening'])
    expect(dominantDayPart([morning, evening])?.id).toBe('evening')
  })
})
