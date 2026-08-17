import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisRequestError } from './analysisTiming'
import { remoteAnalyzePhoto } from './remoteAnalyzePhoto'

describe('remoteAnalyzePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns server and model timings without retaining image contents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      suggestedAmount: 5_200,
      suggestedCategory: 'meal_cafe',
      suggestedTitle: '카페 기록',
      suggestedMemo: '사진으로 분류했어요.',
      confidence: 0.88,
      rawText: '커피',
      engine: 'qwen',
      model: 'Qwen/Qwen2.5-VL-3B-Instruct',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cashlog-total-Time-Ms': '950.1',
        'X-Cashlog-model-Time-Ms': '810.6',
      },
    })))

    const result = await remoteAnalyzePhoto(
      new File(['jpeg-bytes'], 'coffee.jpg', { type: 'image/jpeg' }),
      '/api/analyze',
    )

    expect(result.suggestedCategory).toBe('meal_cafe')
    expect(result.operational).toMatchObject({
      pipeline: 'receipt',
      serverDurationMs: 950,
      modelDurationMs: 811,
      httpStatus: 200,
    })
    expect(result.operational).not.toHaveProperty('imageBase64')
    expect(result.operational).not.toHaveProperty('ocrText')
  })

  it('keeps timing metadata on failed requests for failure-rate analysis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'model unavailable' }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'X-Cashlog-total-Time-Ms': '1200',
        },
      },
    )))

    const error = await remoteAnalyzePhoto(
      new File(['jpeg-bytes'], 'coffee.jpg', { type: 'image/jpeg' }),
      '/api/analyze',
    ).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AnalysisRequestError)
    expect((error as AnalysisRequestError).operational).toMatchObject({
      pipeline: 'receipt',
      serverDurationMs: 1200,
      httpStatus: 502,
    })
    expect((error as AnalysisRequestError).operational.modelDurationMs).toBeUndefined()
  })
})
