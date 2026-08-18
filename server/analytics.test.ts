import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeAnalyticsBatch } from './analytics.js'

describe('analytics event normalization', () => {
  beforeEach(() => {
    vi.stubEnv('ANALYTICS_HASH_SALT', 'cashlog-test-salt-that-is-longer-than-32-characters')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('keeps only approved product metadata and hashes the session identifier', () => {
    const occurredAt = new Date().toISOString()
    const [event] = normalizeAnalyticsBatch({
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      events: [{
        id: 'event_123e4567-e89b-12d3-a456-426614174000',
        name: 'record_saved',
        path: '/?token=secret#private',
        occurredAt,
        properties: {
          source: 'quick-entry',
          has_media: true,
          result: 'mood_added',
          mood_score: 4,
          amount: 12900,
          memo: '절대 저장하면 안 되는 메모',
          email: 'person@example.com',
          latitude: 37.5,
          photo_url: 'https://example.com/private.jpg',
        },
      }],
    }, 'user-1')

    expect(event).toMatchObject({
      client_event_id: 'event_123e4567-e89b-12d3-a456-426614174000',
      user_id: 'user-1',
      event_name: 'record_saved',
      path: '/',
      properties: {
        source: 'quick-entry',
        has_media: true,
        result: 'mood_added',
      },
      occurred_at: occurredAt,
    })
    expect(event.session_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(event.session_hash).not.toContain('123e4567')
    expect(event.properties).not.toHaveProperty('amount')
    expect(event.properties).not.toHaveProperty('memo')
    expect(event.properties).not.toHaveProperty('email')
    expect(event.properties).not.toHaveProperty('latitude')
    expect(event.properties).not.toHaveProperty('photo_url')
    expect(event.properties).not.toHaveProperty('mood_score')
  })

  it('rejects unknown event names and malformed sessions', () => {
    expect(() => normalizeAnalyticsBatch({
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      events: [{ name: 'raw_input_captured' }],
    }, null)).toThrow('지원하지 않는 사용 로그 이벤트예요.')

    expect(() => normalizeAnalyticsBatch({
      sessionId: 'short',
      events: [{ name: 'page_view' }],
    }, null)).toThrow('사용 로그 세션을 확인하지 못했어요.')
  })

  it('accepts bounded behavior timing fields without accepting free-form labels', () => {
    const [event] = normalizeAnalyticsBatch({
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      events: [{
        name: 'action_clicked',
        path: '/signup.html?invite=private',
        properties: {
          scope: 'page',
          view: 'signup',
          view_id: '123e4567-e89b-12d3-a456-426614174000',
          action_id: 'auth.signup.submit',
          action_type: 'button',
          action_sequence: 2,
          time_to_action_ms: 12_345.4,
          scroll_depth_pct: 140,
          reason: 'user@example.com clicked this button',
        },
      }],
    }, null)

    expect(event).toMatchObject({
      event_name: 'action_clicked',
      path: '/signup.html',
      properties: {
        scope: 'page',
        view: 'signup',
        view_id: '123e4567-e89b-12d3-a456-426614174000',
        action_id: 'auth.signup.submit',
        action_type: 'button',
        action_sequence: 2,
        time_to_action_ms: 12_345,
        scroll_depth_pct: 100,
      },
    })
    expect(event.properties).not.toHaveProperty('reason')
  })

  it('keeps bounded operational metrics while stripping image and OCR data', () => {
    const [event] = normalizeAnalyticsBatch({
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      events: [{
        name: 'analysis_succeeded',
        path: '/',
        properties: {
          trace_id: '123e4567-e89b-12d3-a456-426614174001',
          operation: 'photo_analysis',
          pipeline: 'product',
          model: 'Qwen/Qwen2.5-VL-3B-Instruct',
          engine: 'qwen',
          suggested_category: 'meal_cafe',
          duration_ms: 3_420.2,
          server_duration_ms: 2_900.8,
          model_duration_ms: 2_310.4,
          confidence_pct: 112,
          payload_kb: 25_000,
          item_count: 3,
          needs_review: false,
          release: 'abcdef123456',
          server_request_id: 'request_1234567890abcdef',
          ocr_text: '카드번호와 영수증 원문',
          image_base64: 'private-image-data',
          latitude: 37.5,
        },
      }],
    }, null)

    expect(event.properties).toEqual({
      trace_id: '123e4567-e89b-12d3-a456-426614174001',
      operation: 'photo_analysis',
      pipeline: 'product',
      model: 'Qwen/Qwen2.5-VL-3B-Instruct',
      engine: 'qwen',
      suggested_category: 'meal_cafe',
      duration_ms: 3_420,
      server_duration_ms: 2_901,
      model_duration_ms: 2_310,
      confidence_pct: 100,
      payload_kb: 10_240,
      item_count: 3,
      needs_review: false,
      release: 'abcdef123456',
      server_request_id: 'request_1234567890abcdef',
    })
    expect(event.properties).not.toHaveProperty('ocr_text')
    expect(event.properties).not.toHaveProperty('image_base64')
    expect(event.properties).not.toHaveProperty('latitude')
  })

  it('accepts explicit model ratings but strips free-form feedback', () => {
    const [event] = normalizeAnalyticsBatch({
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      events: [{
        name: 'analysis_rating',
        properties: {
          trace_id: '123e4567-e89b-12d3-a456-426614174001',
          rating: 'correct',
          feedback_source: 'analysis_review',
          memo: '사용자가 입력한 비공개 설명',
        },
      }],
    }, null)

    expect(event.properties).toEqual({
      trace_id: '123e4567-e89b-12d3-a456-426614174001',
      rating: 'correct',
      feedback_source: 'analysis_review',
    })
    expect(event.client_event_id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
