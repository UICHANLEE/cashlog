import { afterEach, describe, expect, it, vi } from 'vitest'
import { authRequestPasswordReset } from './supabase.js'

describe('password reset provider contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('requests a Supabase recovery email with the Cashlog callback', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await authRequestPasswordReset('user@example.com', 'https://cashlog.ai.kr')

    const [requestUrl, request] = fetchMock.mock.calls[0]
    const url = new URL(String(requestUrl))
    expect(url.pathname).toBe('/auth/v1/recover')
    expect(url.searchParams.get('redirect_to')).toBe('https://cashlog.ai.kr/reset-password.html')
    expect(JSON.parse(String(request?.body))).toEqual({ email: 'user@example.com' })
  })
})
