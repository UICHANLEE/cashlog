import { describe, expect, it } from 'vitest'
import {
  analyzePhoto,
  categoryTree,
  createExpenseFromAnalysis,
  generateDailyLog,
  getCalendarDays,
  getExpensesForDate,
  getMonthlyTotal,
  migrateCategoryId,
} from './cashlog'

describe('cashlog domain', () => {
  it('returns a realistic mock analysis from a photo name', async () => {
    const file = new File(['receipt'], 'cafe-receipt.jpg', { type: 'image/jpeg' })

    const analysis = await analyzePhoto(file)

    expect(analysis.suggestedAmount).toBeGreaterThan(0)
    expect(analysis.suggestedCategory).toBe('meal_cafe')
    expect(analysis.suggestedTitle).toContain('카페')
    expect(analysis.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('creates an editable expense from photo analysis', () => {
    const expense = createExpenseFromAnalysis({
      analysis: {
        suggestedAmount: 12800,
        suggestedCategory: 'meal_dining',
        suggestedTitle: '브런치',
        suggestedMemo: '친구와 브런치를 먹은 기록',
        confidence: 0.86,
        rawText: '브런치 12,800원',
      },
      imageUrl: 'blob:test-image',
      dateTime: '2026-05-01T12:30:00.000Z',
    })

    expect(expense).toMatchObject({
      amount: 12800,
      category: 'meal_dining',
      title: '브런치',
      memo: '친구와 브런치를 먹은 기록',
      source: 'photo',
      imageUrl: 'blob:test-image',
      dateTime: '2026-05-01T12:30:00.000Z',
    })
    expect(expense.id).toMatch(/^expense-/)
  })

  it('summarizes a day as a diary-like log', () => {
    const expenses = [
      createExpenseFromAnalysis({
        analysis: {
          suggestedAmount: 4500,
          suggestedCategory: 'meal_cafe',
          suggestedTitle: '아침 커피',
          suggestedMemo: '출근길에 산 커피',
          confidence: 0.9,
          rawText: '',
        },
        imageUrl: 'blob:coffee',
        dateTime: '2026-05-01T08:30:00.000Z',
      }),
      createExpenseFromAnalysis({
        analysis: {
          suggestedAmount: 18000,
          suggestedCategory: 'leisure_show',
          suggestedTitle: '전시 관람',
          suggestedMemo: '퇴근 후 전시회',
          confidence: 0.84,
          rawText: '',
        },
        imageUrl: 'blob:gallery',
        dateTime: '2026-05-01T19:00:00.000Z',
      }),
    ]

    const log = generateDailyLog('2026-05-01', expenses)

    expect(log.summary).toContain('아침 커피')
    expect(log.summary).toContain('전시 관람')
    expect(log.highlights).toEqual(['아침 커피', '전시 관람'])
    expect(log.expenseIds).toHaveLength(2)
  })

  it('filters and totals expenses by date and month', () => {
    const expenses = [
      createExpenseFromAnalysis({
        analysis: {
          suggestedAmount: 10000,
          suggestedCategory: 'meal_dining',
          suggestedTitle: '점심',
          suggestedMemo: '',
          confidence: 0.8,
          rawText: '',
        },
        imageUrl: '',
        dateTime: '2026-05-01T03:00:00.000Z',
      }),
      createExpenseFromAnalysis({
        analysis: {
          suggestedAmount: 22000,
          suggestedCategory: 'transit_public',
          suggestedTitle: '택시',
          suggestedMemo: '',
          confidence: 0.8,
          rawText: '',
        },
        imageUrl: '',
        dateTime: '2026-05-02T15:00:00.000Z',
      }),
    ]

    expect(getExpensesForDate(expenses, '2026-05-01')).toHaveLength(1)
    expect(getMonthlyTotal(expenses, '2026-05')).toBe(32000)
  })

  it('builds a month grid with categories for UI badges', () => {
    const days = getCalendarDays(2026, 4)

    expect(days).toHaveLength(35)
    expect(days.some((day) => day.isoDate === '2026-05-01')).toBe(true)
    expect(categoryTree.flatMap((g) => g.leaves).some((l) => l.id === 'meal_grocery')).toBe(
      true,
    )
  })

  it('migrates legacy flat category ids', () => {
    expect(migrateCategoryId('food')).toBe('meal_dining')
    expect(migrateCategoryId('transport')).toBe('transit_public')
    expect(migrateCategoryId('meal_cafe')).toBe('meal_cafe')
    expect(migrateCategoryId('unknown-xyz')).toBe('misc_uncat')
  })
})
