import { describe, expect, it } from 'vitest'
import {
  applyProductAnalysisRevision,
  mapProductKeywordToCategory,
  normalizeProductImageAnalysis,
} from './productImage'

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
    expect(result.status).toBe('final')
    expect(result.items[0]?.topCategories).toHaveLength(3)
    expect(result.items[0]?.topCategories?.reduce((sum, item) => sum + item.confidence, 0)).toBeCloseTo(1)
  })

  it('normalizes the v1 provisional contract and preserves user edits on revision', () => {
    const provisional = normalizeProductImageAnalysis({
      request_id: 'req-1',
      status: 'provisional',
      revision: 0,
      verification: { state: 'queued' },
      products: [{
        product_id: 'p1',
        display_name: '생수',
        candidates: [
          { rank: 1, group_id: 'meal', leaf_id: 'meal_drink', confidence: 0.88 },
          { rank: 2, group_id: 'meal', leaf_id: 'meal_grocery', confidence: 0.08 },
          { rank: 3, group_id: 'misc', leaf_id: 'misc_uncat', confidence: 0.04 },
        ],
      }],
      decision: { mode: 'auto_select', requires_user_confirmation: false },
    })
    const final = {
      ...provisional,
      event: 'analysis_revision' as const,
      status: 'final' as const,
      revision: 1,
      changed: true,
      recommendedCategory: 'meal_grocery' as const,
    }

    const applied = applyProductAnalysisRevision({
      current: provisional,
      revision: final,
      userEditedCategory: 'life_goods',
    })

    expect(provisional.status).toBe('provisional')
    expect(provisional.verification.state).toBe('queued')
    expect(provisional.items[0]?.topCategories).toHaveLength(3)
    expect(applied.recommendedCategory).toBe('life_goods')
    expect(applied.revision).toBe(1)
  })
})
