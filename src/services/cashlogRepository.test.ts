import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManualExpense } from '../domain/cashlog'
import { createCashlogRepository, mergeExpenses } from './cashlogRepository'

describe('cashlog category feedback repository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('writes an idempotent pending feedback event without client review fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return new Response(null, { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const repository = createCashlogRepository(
      { url: 'https://project.supabase.co', anonKey: 'anon' },
      { accessToken: 'jwt', user: { id: 'user-1' } },
    )

    await repository?.saveCategoryFeedback({
      schemaVersion: 2,
      eventId: '00000000-0000-4000-8000-000000000001',
      sampleId: '00000000-0000-4000-8000-000000000002',
      expenseId: 'expense-1',
      requestId: 'request-1',
      modelVersion: 'cashlog33-hybrid-v1.1-fast',
      taxonomyVersion: '13.33.1',
      modelCategory: 'meal_cafe',
      userCategory: 'meal_dining',
      confidence: 0.72,
      predictedTop3: [
        { category: 'meal_cafe', confidence: 0.72 },
        { category: 'meal_dining', confidence: 0.2 },
      ],
      selectedLeafId: 'meal_dining',
      occurredAt: '2026-07-17T00:00:00.000Z',
      source: 'top3_selection',
      imageRetentionConsent: true,
      imageObjectKey: 'user-1/expense-1.jpg',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://project.supabase.co/rest/v1/cashlog_category_feedback?on_conflict=event_id',
    )
    const body = JSON.parse(String((request as RequestInit).body))
    expect(body).toMatchObject({
      user_id: 'user-1',
      schema_version: 2,
      event_id: '00000000-0000-4000-8000-000000000001',
      selected_leaf_id: 'meal_dining',
      source: 'top3_selection',
      image_retention_consent: true,
      image_object_key: 'user-1/expense-1.jpg',
    })
    expect(body.review_status).toBeUndefined()
    expect((request as RequestInit).headers).toMatchObject({
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    })
  })

  it('keeps a device photo key when the cloud row has not received the image yet', () => {
    const local = {
      ...createManualExpense({
        title: '카페',
        amount: 5000,
        category: 'meal_cafe',
        memo: '',
        dateTime: '2026-07-18T12:00:00.000Z',
      }),
      id: 'expense-photo',
      source: 'photo' as const,
      imageLocalKey: 'local-image:expense-photo',
      imageUrl: 'blob:device-photo',
    }
    const remote = { ...local, imageLocalKey: undefined, imageUrl: undefined }

    expect(mergeExpenses([local], [remote])[0]).toMatchObject({
      imageLocalKey: 'local-image:expense-photo',
      imageUrl: 'blob:device-photo',
    })
  })

  it('round-trips the mood score through Supabase rows', async () => {
    const row = {
      id: 'expense-mood',
      date_time: '2026-07-23T12:00:00.000Z',
      local_date: '2026-07-23',
      time_zone: 'Asia/Seoul',
      latitude: 37.5665,
      longitude: 126.978,
      location_accuracy_m: 20,
      amount: 7500,
      kind: 'expense',
      category: 'meal_cafe',
      title: '카페',
      memo: '',
      mood_score: 5,
      source: 'manual',
      created_at: '2026-07-23T12:00:00.000Z',
      updated_at: '2026-07-23T12:00:00.000Z',
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(null, { status: 201 })
        : new Response(JSON.stringify([row]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const repository = createCashlogRepository(
      { url: 'https://project.supabase.co', anonKey: 'anon' },
      { accessToken: 'jwt', user: { id: 'user-1' } },
    )

    const [expense] = (await repository?.listExpenses()) ?? []
    expect(expense.moodScore).toBe(5)
    expect(expense).toMatchObject({
      localDate: '2026-07-23',
      timeZone: 'Asia/Seoul',
      location: {
        latitude: 37.5665,
        longitude: 126.978,
        accuracyMeters: 20,
      },
    })

    await repository?.upsertExpense(expense)
    const upsertBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(upsertBody[0].mood_score).toBe(5)
    expect(upsertBody[0]).toMatchObject({
      local_date: '2026-07-23',
      time_zone: 'Asia/Seoul',
      latitude: 37.5665,
      longitude: 126.978,
      location_accuracy_m: 20,
    })
  })
})
