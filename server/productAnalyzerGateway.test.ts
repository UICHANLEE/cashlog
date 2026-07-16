import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProductAnalyzerConfig } from './productAnalyzerGateway'

describe('product analyzer gateway config', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps local development compatible without credentials', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PRODUCT_ANALYZER_API_URL', 'http://127.0.0.1:8010')

    const config = getProductAnalyzerConfig()

    expect(config.endpoint).toBe('http://127.0.0.1:8010/analyze-image')
    expect(config.healthUrl).toBe('http://127.0.0.1:8010/health')
    expect(config.authMode).toBe('none')
    expect(config.configurationError).toBeNull()
  })

  it('adds API key and Cloudflare Access credentials as server-only headers', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PRODUCT_ANALYZER_API_URL', 'https://ai.example.com/analyze-image')
    vi.stubEnv('PRODUCT_ANALYZER_API_KEY', 'gateway-secret')
    vi.stubEnv('CLOUDFLARE_ACCESS_CLIENT_ID', 'client-id.access')
    vi.stubEnv('CLOUDFLARE_ACCESS_CLIENT_SECRET', 'access-secret')

    const config = getProductAnalyzerConfig()

    expect(config.authMode).toBe('api_key+cloudflare_access')
    expect(config.headers).toEqual({
      'X-API-Key': 'gateway-secret',
      'CF-Access-Client-Id': 'client-id.access',
      'CF-Access-Client-Secret': 'access-secret',
    })
    expect(config.configurationError).toBeNull()
  })

  it('fails closed when a deployed analyzer has no server credential', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PRODUCT_ANALYZER_API_URL', 'https://ai.example.com')

    const config = getProductAnalyzerConfig()

    expect(config.authRequired).toBe(true)
    expect(config.configurationError).toContain('서버 전용 인증 정보')
  })

  it('rejects an incomplete Cloudflare Access credential pair', () => {
    vi.stubEnv('PRODUCT_ANALYZER_API_URL', 'https://ai.example.com')
    vi.stubEnv('CLOUDFLARE_ACCESS_CLIENT_ID', 'client-id.access')

    expect(getProductAnalyzerConfig().configurationError).toContain('함께 설정')
  })
})
