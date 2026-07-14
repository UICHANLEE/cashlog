import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCashlogAuthClient } from './auth'

describe('Cashlog signup consent', () => {
  afterEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
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
    const signupUrl = new URL(String(request[0]))
    expect(signupUrl.origin + signupUrl.pathname).toBe('https://cashlog.supabase.co/auth/v1/signup')
    expect(signupUrl.searchParams.get('redirect_to')).toBe(window.location.origin + '/')
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

  it('exchanges a token-hash confirmation link for a session', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    window.history.replaceState({}, '', '/?token_hash=confirm-token&type=signup')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://cashlog.supabase.co/auth/v1/verify')
      expect(JSON.parse(String(init?.body))).toEqual({ token_hash: 'confirm-token', type: 'signup' })
      return new Response(
        JSON.stringify({
          access_token: 'verified-access',
          refresh_token: 'verified-refresh',
          expires_in: 3600,
          user: { id: 'user-1', email: 'me@example.com' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const session = await createCashlogAuthClient().consumeSessionFromUrl()

    expect(session?.accessToken).toBe('verified-access')
    expect(window.location.search).toBe('')
  })

  it('surfaces errors returned in an email-link fragment', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    window.history.replaceState({}, '', '/#error=access_denied&error_description=Email+link+is+invalid')

    await expect(createCashlogAuthClient().consumeSessionFromUrl()).rejects.toThrow(
      'Email link is invalid',
    )
    expect(window.location.hash).toBe('')
  })

  it('builds Google and Kakao authorize URLs that return to Cashlog', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const client = createCashlogAuthClient()

    const google = new URL(client.getOAuthAuthorizeUrl('google'))
    const kakao = new URL(client.getOAuthAuthorizeUrl('kakao'))

    expect(google.pathname).toBe('/auth/v1/authorize')
    expect(google.searchParams.get('provider')).toBe('google')
    expect(google.searchParams.get('redirect_to')).toBe(window.location.origin + '/')
    expect(kakao.searchParams.get('provider')).toBe('kakao')
  })

  it('stores pending OAuth consent in the authenticated user row', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    localStorage.setItem('cashlog.oauth.pending-consent', JSON.stringify({
      age14: true,
      privacy: true,
      photoAndTime: true,
      location: false,
      consentVersion: '2026-07-14',
      consentedAt: '2026-07-14T00:00:00.000Z',
    }))
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args
      return new Response('', { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const saved = await createCashlogAuthClient().persistPendingOAuthConsent({
      accessToken: 'oauth-access',
      user: { id: 'oauth-user', email: 'oauth@example.com' },
    })

    expect(saved).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/rest/v1/cashlog_user_consents?on_conflict=user_id')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      user_id: 'oauth-user',
      app_id: 'cashlog',
      privacy_consent: true,
      location_consent: false,
    })
    expect(localStorage.getItem('cashlog.oauth.pending-consent')).toBeNull()
  })
})
