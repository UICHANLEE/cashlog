import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReservation } from './reservationRepository'

describe('reservation repository', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('stores a normalized consented email in Supabase', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args
      return new Response('', { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createReservation(' Hello@Example.com ')).resolves.toBe('created')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://cashlog.supabase.co/rest/v1/cashlog_reservations')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: 'hello@example.com',
      marketing_consent: true,
      consent_version: '2026-07-14',
      source: 'reservation',
    })
  })

  it('treats an existing email as an already completed reservation', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })))

    await expect(createReservation('hello@example.com')).resolves.toBe('duplicate')
  })
})
