import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteAnalyzeProductImage } from './remoteAnalyzeProductImage'

describe('remoteAnalyzeProductImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts product analysis API output into PhotoAnalysis', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            recommended_category: 'meal_dining',
            confidence: 0.84,
            reason: "로컬 MobileNetV4 모델이 상품 사진을 '식비' 범주로 분류했습니다.",
            items: [
              {
                name: 'food',
                display_name: '식비',
                category: 'meal_dining',
                confidence: 0.84,
                top_categories: [
                  { category: 'meal_dining', confidence: 0.84 },
                  { category: 'meal_cafe', confidence: 0.16 },
                ],
              },
            ],
            need_user_check: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await remoteAnalyzeProductImage(
      new File(['image'], 'meal.jpg', { type: 'image/jpeg' }),
      '/api/analyze-image',
    )

    expect(result.suggestedCategory).toBe('meal_dining')
    expect(result.detectedItems?.[0]?.displayName).toBe('식비')
    expect(result.topCategories?.[0]).toEqual({ category: 'meal_dining', confidence: 0.84 })
    expect(result.needUserCheck).toBe(false)
  })

  it('uses FastAPI detail messages for failed product analysis requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: 'image file or imageBase64 is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(
      remoteAnalyzeProductImage(new File(['image'], 'empty.jpg', { type: 'image/jpeg' }), '/api/analyze-image'),
    ).rejects.toThrow('image file or imageBase64 is required')
  })
})
