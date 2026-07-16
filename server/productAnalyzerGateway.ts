export type ProductAnalyzerAuthMode =
  | 'none'
  | 'api_key'
  | 'cloudflare_access'
  | 'api_key+cloudflare_access'

export type ProductAnalyzerConfig = {
  endpoint: string | null
  healthUrl: string | null
  headers: Record<string, string>
  authMode: ProductAnalyzerAuthMode
  authRequired: boolean
  timeoutMs: number
  configurationError: string | null
}

const enabled = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value?.trim() ?? '')

const endpointFromEnv = () => {
  const raw = process.env.PRODUCT_ANALYZER_API_URL?.trim() || process.env.CATAI_PRODUCT_API_URL?.trim()
  if (!raw) return null
  const normalized = raw.replace(/\/$/, '')
  return normalized.endsWith('/analyze-image') ? normalized : `${normalized}/analyze-image`
}

const timeoutFromEnv = () => {
  const parsed = Number(process.env.PRODUCT_ANALYZER_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return 60_000
  return Math.max(1_000, Math.min(120_000, Math.round(parsed)))
}

const authRequiredFromEnv = () => {
  if (process.env.PRODUCT_ANALYZER_REQUIRE_AUTH !== undefined) {
    return enabled(process.env.PRODUCT_ANALYZER_REQUIRE_AUTH)
  }
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV)
}

export const getProductAnalyzerConfig = (): ProductAnalyzerConfig => {
  const endpoint = endpointFromEnv()
  const apiKey = process.env.PRODUCT_ANALYZER_API_KEY?.trim()
  const accessClientId = process.env.CLOUDFLARE_ACCESS_CLIENT_ID?.trim()
  const accessClientSecret = process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET?.trim()
  const hasAccessPair = Boolean(accessClientId && accessClientSecret)
  const hasPartialAccessPair = Boolean(accessClientId) !== Boolean(accessClientSecret)
  const authRequired = authRequiredFromEnv()

  const headers: Record<string, string> = {}
  if (apiKey) headers['X-API-Key'] = apiKey
  if (hasAccessPair) {
    headers['CF-Access-Client-Id'] = accessClientId as string
    headers['CF-Access-Client-Secret'] = accessClientSecret as string
  }

  const authMode: ProductAnalyzerAuthMode = apiKey
    ? hasAccessPair
      ? 'api_key+cloudflare_access'
      : 'api_key'
    : hasAccessPair
      ? 'cloudflare_access'
      : 'none'

  let configurationError: string | null = null
  if (hasPartialAccessPair) {
    configurationError = 'Cloudflare Access client ID와 secret은 함께 설정해야 합니다.'
  } else if (endpoint && authRequired && authMode === 'none') {
    configurationError = '배포 환경의 상품 분석 서버에는 서버 전용 인증 정보가 필요합니다.'
  }

  return {
    endpoint,
    healthUrl: endpoint ? new URL('/health', endpoint).toString() : null,
    headers,
    authMode,
    authRequired,
    timeoutMs: timeoutFromEnv(),
    configurationError,
  }
}

export const assertProductAnalyzerConfig = (config: ProductAnalyzerConfig) => {
  if (config.configurationError) throw new Error(config.configurationError)
}
