import { describe, expect, it } from 'vitest'
import { looksIncomeLikeSlide, netOutflowContribution } from './storyMoneyFlow'

describe('storyMoneyFlow', () => {
  it('classifies headline or detail for 수입 hints', () => {
    expect(looksIncomeLikeSlide('점심', '식당')).toBe(false)
    expect(looksIncomeLikeSlide('환불', '')).toBe(true)
    expect(looksIncomeLikeSlide('카드', '캐시백 받음')).toBe(true)
    expect(looksIncomeLikeSlide('이번 달 급여', '')).toBe(true)
  })

  it('netOutflowContribution adds spends and subtracts income-like amounts', () => {
    expect(netOutflowContribution('커피', '', 3500)).toBe(3500)
    expect(netOutflowContribution('반품 환급', '입금 확인', 10000)).toBe(-10000)
    expect(netOutflowContribution('환불 처리', '', 9000, false)).toBe(9000)
    expect(netOutflowContribution('알바비', '', 50000, true)).toBe(-50000)
  })
})
