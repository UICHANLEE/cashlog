import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisRequestError } from './analysisTiming'
import { optimizeProductImageUpload, remoteAnalyzeProductImage } from './remoteAnalyzeProductImage'

describe('remoteAnalyzeProductImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shrinks a large browser image before upload', async () => {
    const drawImage = vi.fn()
    const close = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(new Blob([new Uint8Array(200_000)], { type: 'image/jpeg' }))
      }),
    }
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2400, height: 1800, close })),
    )
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)

    const source = new File([new Uint8Array(800_000)], 'receipt.png', {
      type: 'image/png',
      lastModified: 123,
    })
    const optimized = await optimizeProductImageUpload(source)

    expect(optimized.name).toBe('receipt.jpg')
    expect(optimized.type).toBe('image/jpeg')
    expect(optimized.size).toBe(200_000)
    expect(canvas.width).toBe(960)
    expect(canvas.height).toBe(720)
    expect(drawImage).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
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
            model: 'cashlog33-hybrid-v1.1-fast',
            taxonomy_version: '13.33.1',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Cashlog-total-Time-Ms': '842.4',
              'X-Cashlog-analyzer-Time-Ms': '701.7',
              'X-Request-ID': 'request_product_123456',
            },
          },
        ),
      ),
    )

    const result = await remoteAnalyzeProductImage(
      new File(['image'], 'meal.jpg', { type: 'image/jpeg' }),
      '/api/analyze-image',
    )

    expect(result.suggestedCategory).toBe('meal_dining')
    expect(result.detectedItems?.[0]?.displayName).toBe('식비')
    expect(result.topCategories?.[0]).toMatchObject({ category: 'meal_dining', confidence: 0.84 })
    expect(result.needUserCheck).toBe(false)
    expect(result.status).toBe('final')
    expect(result.model).toBe('cashlog33-hybrid-v1.1-fast')
    expect(result.taxonomyVersion).toBe('13.33.1')
    expect(result.operational).toMatchObject({
      pipeline: 'product',
      serverRequestId: 'request_product_123456',
      serverDurationMs: 842,
      modelDurationMs: 702,
      httpStatus: 200,
    })
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

  it('preserves a safe error code and request identifier on failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'private upstream failure details', code: 'ANALYZER_UNAVAILABLE' }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'request_product_failed',
          },
        }),
      ),
    )

    const error = await remoteAnalyzeProductImage(
      new File(['image'], 'meal.jpg', { type: 'image/jpeg' }),
      '/api/analyze-image',
    ).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AnalysisRequestError)
    expect((error as AnalysisRequestError).code).toBe('ANALYZER_UNAVAILABLE')
    expect((error as Error).message).toBe('지금은 상품을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect((error as AnalysisRequestError).operational.serverRequestId).toBe('request_product_failed')
  })
})
