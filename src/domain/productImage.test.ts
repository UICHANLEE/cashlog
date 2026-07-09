import { describe, expect, it } from 'vitest'
import { mapProductKeywordToCategory, normalizeProductImageAnalysis } from './productImage'

describe('product image category pipeline', () => {
  it('maps product keywords to Cashlog category ids', () => {
    expect(mapProductKeywordToCategory('아이스 아메리카노 coffee')).toBe('meal_cafe')
    expect(mapProductKeywordToCategory('보조배터리 charger')).toBe('life_appliance')
    expect(mapProductKeywordToCategory('비타민 medicine')).toBe('health_med')
    expect(mapProductKeywordToCategory('unknown brand box')).toBe('misc_uncat')
  })

  it('normalizes product analysis and marks low confidence for user check', () => {
    const result = normalizeProductImageAnalysis({
      success: true,
      recommended_category: 'meal_cafe',
      confidence: 0.54,
      reason: '커피로 보이는 상품이 감지됨',
      items: [
        {
          name: 'coffee',
          display_name: '커피',
          category: 'meal_cafe',
          confidence: 0.54,
          bbox: [120, 80, 340, 420],
        },
      ],
    })

    expect(result.recommendedCategory).toBe('meal_cafe')
    expect(result.items[0]?.displayName).toBe('커피')
    expect(result.items[0]?.bbox).toEqual([120, 80, 340, 420])
    expect(result.needUserCheck).toBe(true)
  })
})
