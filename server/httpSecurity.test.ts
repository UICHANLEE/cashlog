import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAllowedOrigins, guardApiOrigin } from './httpSecurity'

const responseMock = () => {
  const headers = new Map<string, string>()
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn(() => response),
    json: vi.fn(() => response),
    end: vi.fn(() => response),
  }
  return { response, headers }
}

describe('API origin guard', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows only configured origins without using a wildcard', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CASHLOG_ALLOWED_ORIGINS', 'https://cashlog.example.com')
    const { response, headers } = responseMock()

    expect(guardApiOrigin({ method: 'POST', headers: { origin: 'https://cashlog.example.com' } } as never, response as never)).toBe(true)
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://cashlog.example.com')
    expect([...headers.values()]).not.toContain('*')
  })

  it('rejects an untrusted browser origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CASHLOG_ALLOWED_ORIGINS', 'https://cashlog.example.com')
    const { response } = responseMock()

    expect(guardApiOrigin({ method: 'POST', headers: { origin: 'https://attacker.example' } } as never, response as never)).toBe(false)
    expect(response.status).toHaveBeenCalledWith(403)
  })

  it('includes the current Vercel deployment origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_URL', 'cashlog-preview.vercel.app')
    expect(getAllowedOrigins()).toContain('https://cashlog-preview.vercel.app')
  })
})
