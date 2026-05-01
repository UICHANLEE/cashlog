import { describe, expect, it } from 'vitest'
import {
  calendarDayDelta,
  formatDayLogRelativeKo,
  formatMonthLogRelativeKo,
} from './relativeLabelsKo'

const MS_HOUR = 3_600_000

describe('relativeLabelsKo', () => {
  it('day log: >1시간 → 시간 전', () => {
    const ref = Date.now()
    expect(
      formatDayLogRelativeKo(new Date(ref - 3_700_000), new Date(ref)),
    ).toBe('1시간 전')
    expect(
      formatDayLogRelativeKo(new Date(ref - 4 * MS_HOUR), new Date(ref)),
    ).toBe('4시간 전')
  })

  it('day log: 1시간 이내·1분 이상 → 분 전', () => {
    const ref = Date.now()
    expect(
      formatDayLogRelativeKo(new Date(ref - MS_HOUR), new Date(ref)),
    ).toBe('60분 전')
    expect(
      formatDayLogRelativeKo(new Date(ref - 90_000), new Date(ref)),
    ).toBe('1분 전')
  })

  it('day log: 1분 미만 → 방금 전', () => {
    const ref = Date.now()
    expect(formatDayLogRelativeKo(new Date(ref - 30_000), new Date(ref))).toBe(
      '방금 전',
    )
  })

  it('month log: same local day 오늘, else N일 전', () => {
    const to = new Date(2026, 4, 15, 15, 0, 0)
    expect(formatMonthLogRelativeKo(new Date(2026, 4, 15, 8, 0, 0), to)).toBe('오늘')
    expect(formatMonthLogRelativeKo(new Date(2026, 4, 14, 23, 0, 0), to)).toBe('1일 전')
    expect(formatMonthLogRelativeKo(new Date(2026, 4, 10, 1, 0, 0), to)).toBe('5일 전')
  })

  it('calendarDayDelta across month boundary', () => {
    const from = new Date(2026, 3, 28)
    const to = new Date(2026, 4, 2)
    expect(calendarDayDelta(from, to)).toBe(4)
  })
})
