import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCashlogAuthClient } from './auth'

describe('Cashlog signup consent', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends versioned required and optional consent metadata', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return new Response(JSON.stringify({ user: { id: 'user-1', email: 'me@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await createCashlogAuthClient().signUpWithPassword('me@example.com', 'secret1', {
      age14: true,
      privacy: true,
      photoAndTime: true,
      location: false,
    })

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request[1]?.body)) as { data: Record<string, unknown> }
    expect(request[0]).toBe('https://cashlog.supabase.co/auth/v1/signup')
    expect(body.data).toMatchObject({
      app_id: 'cashlog',
      consent_version: '2026-07-14',
      age_14_or_older: true,
      privacy_consent: true,
      photo_time_consent: true,
      location_consent: false,
    })
    expect(body.data.consented_at).toEqual(expect.any(String))
  })
})
