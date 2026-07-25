import { getSupabaseConfig, type SupabaseConfig } from './supabaseConfig'

const SESSION_STORAGE_KEY = 'cashlog.supabase.session'
const OAUTH_CONSENT_STORAGE_KEY = 'cashlog.oauth.pending-consent'

export type OAuthProvider = 'google' | 'kakao'

export type CashlogUser = {
  id: string
  email?: string
}

export type CashlogSession = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  user?: CashlogUser
}

export const CASHLOG_CONSENT_VERSION = '2026-07-26'

export type SignupConsents = {
  age14: true
  privacy: true
  photoAndTime: true
  location: boolean
}

export type StoredSignupConsents = {
  age14: boolean
  privacy: boolean
  photoAndTime: boolean
  location: boolean
  consentVersion: string
}

type SupabaseAuthBody = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: {
    id?: string
    email?: string
  }
}

type PendingOAuthConsent = SignupConsents & {
  consentVersion: string
  consentedAt: string
}

const redirectTarget = () =>
  typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined

const clearAuthParamsFromUrl = () => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of ['token_hash', 'type', 'code', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(key)
  }
  url.hash = ''
  window.history.replaceState(null, document.title, url.pathname + url.search)
}

const authHeaders = (config: SupabaseConfig, token?: string) => ({
  apikey: config.anonKey,
  Authorization: `Bearer ${token ?? config.anonKey}`,
  'Content-Type': 'application/json',
})

const parseSessionPayload = (params: URLSearchParams): CashlogSession | null => {
  const accessToken = params.get('access_token')
  if (!accessToken) return null

  const expiresIn = Number(params.get('expires_in'))
  return {
    accessToken,
    refreshToken: params.get('refresh_token') ?? undefined,
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined,
  }
}

const sessionFromAuthBody = (body: SupabaseAuthBody): CashlogSession | null => {
  if (!body.access_token) return null
  const expiresIn = Number(body.expires_in)
  const user = body.user?.id
    ? { id: body.user.id, ...(body.user.email ? { email: body.user.email } : {}) }
    : undefined
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined,
    ...(user ? { user } : {}),
  }
}

const readAuthError = async (response: Response, fallback: string) => {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as { error_description?: string; msg?: string; message?: string; error?: string }
    return body.error_description ?? body.msg ?? body.message ?? body.error ?? fallback
  } catch {
    return text || fallback
  }
}

export const createCashlogAuthClient = () => {
  const config = getSupabaseConfig()

  const loadStoredSession = (): CashlogSession | null => {
    if (!config) return null
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CashlogSession
      if (!parsed.accessToken) return null
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) return null
      return parsed
    } catch {
      return null
    }
  }

  const saveSession = (session: CashlogSession | null) => {
    if (!config) return
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  const consumeSessionFromUrl = async (): Promise<CashlogSession | null> => {
    if (!config || typeof window === 'undefined') return null
    const hash = window.location.hash.replace(/^#/, '')
    const hashParams = new URLSearchParams(hash)
    const authError = hashParams.get('error_description') ?? hashParams.get('error')
    if (authError) {
      clearAuthParamsFromUrl()
      throw new Error(decodeURIComponent(authError.replace(/\+/g, ' ')))
    }

    if (hash.includes('access_token=')) {
      const session = parseSessionPayload(hashParams)
      if (session) clearAuthParamsFromUrl()
      return session
    }

    const query = new URLSearchParams(window.location.search)
    const tokenHash = query.get('token_hash')
    const type = query.get('type')
    if (!tokenHash || !type) return null

    const response = await fetch(`${config.url}/auth/v1/verify`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ token_hash: tokenHash, type }),
    })
    clearAuthParamsFromUrl()
    if (!response.ok) {
      throw new Error(await readAuthError(response, '인증 링크가 만료되었거나 이미 사용되었어요.'))
    }
    const session = sessionFromAuthBody((await response.json()) as SupabaseAuthBody)
    if (!session) throw new Error('인증은 완료됐지만 로그인 세션을 만들지 못했어요.')
    return session
  }

  const signInWithEmail = async (email: string) => {
    if (!config) throw new Error('Supabase 환경변수가 설정되지 않았어요.')
    const redirectTo = redirectTarget()
    const endpoint = new URL(`${config.url}/auth/v1/otp`)
    if (redirectTo) endpoint.searchParams.set('redirect_to', redirectTo)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({
        email,
        create_user: false,
        options: redirectTo ? { email_redirect_to: redirectTo } : undefined,
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || '로그인 메일을 보낼 수 없어요.')
    }
  }

  const signInWithPassword = async (email: string, password: string): Promise<CashlogSession> => {
    if (!config) throw new Error('Supabase 환경변수가 설정되지 않았어요.')
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      throw new Error(await readAuthError(response, '이메일 또는 비밀번호를 확인해 주세요.'))
    }
    const body = (await response.json()) as SupabaseAuthBody
    const session = sessionFromAuthBody(body)
    if (!session) throw new Error('로그인 응답에 세션이 없어요.')
    return session
  }

  const getOAuthAuthorizeUrl = (provider: OAuthProvider) => {
    if (!config) throw new Error('Supabase 환경변수가 설정되지 않았어요.')
    const endpoint = new URL(`${config.url}/auth/v1/authorize`)
    endpoint.searchParams.set('provider', provider)
    const redirectTo = redirectTarget()
    if (redirectTo) endpoint.searchParams.set('redirect_to', redirectTo)
    return endpoint.toString()
  }

  const signInWithOAuth = (provider: OAuthProvider, consents: SignupConsents) => {
    if (typeof window === 'undefined') return
    const pendingConsent: PendingOAuthConsent = {
      ...consents,
      consentVersion: CASHLOG_CONSENT_VERSION,
      consentedAt: new Date().toISOString(),
    }
    localStorage.setItem(OAUTH_CONSENT_STORAGE_KEY, JSON.stringify(pendingConsent))
    window.location.assign(getOAuthAuthorizeUrl(provider))
  }

  const persistPendingOAuthConsent = async (session: CashlogSession) => {
    if (!config || typeof window === 'undefined') return false
    const raw = localStorage.getItem(OAUTH_CONSENT_STORAGE_KEY)
    if (!raw) return false

    let consent: PendingOAuthConsent
    try {
      consent = JSON.parse(raw) as PendingOAuthConsent
    } catch {
      localStorage.removeItem(OAUTH_CONSENT_STORAGE_KEY)
      return false
    }

    const user = session.user ?? (await getUser(session))
    if (!user?.id) throw new Error('간편 로그인 계정 정보를 확인하지 못했어요.')
    const response = await fetch(`${config.url}/rest/v1/cashlog_user_consents?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        ...authHeaders(config, session.accessToken),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: user.id,
        app_id: 'cashlog',
        consent_version: consent.consentVersion,
        age_14_or_older: consent.age14,
        privacy_consent: consent.privacy,
        photo_time_consent: consent.photoAndTime,
        location_consent: consent.location,
        consented_at: consent.consentedAt,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) {
      throw new Error(await readAuthError(response, '간편 로그인 동의 내역을 저장하지 못했어요.'))
    }
    localStorage.removeItem(OAUTH_CONSENT_STORAGE_KEY)
    return true
  }

  const getSignupConsents = async (
    session: CashlogSession,
  ): Promise<StoredSignupConsents | null> => {
    if (!config) return null
    const user = session.user ?? (await getUser(session))
    if (!user?.id) return null
    const endpoint = new URL(`${config.url}/rest/v1/cashlog_user_consents`)
    endpoint.searchParams.set(
      'select',
      'consent_version,age_14_or_older,privacy_consent,photo_time_consent,location_consent',
    )
    endpoint.searchParams.set('user_id', `eq.${user.id}`)
    endpoint.searchParams.set('app_id', 'eq.cashlog')
    endpoint.searchParams.set('limit', '1')
    const response = await fetch(endpoint, {
      headers: authHeaders(config, session.accessToken),
    })
    if (!response.ok) return null
    const rows = (await response.json()) as Array<{
      consent_version?: string
      age_14_or_older?: boolean
      privacy_consent?: boolean
      photo_time_consent?: boolean
      location_consent?: boolean
    }>
    const row = rows[0]
    if (!row) return null
    return {
      age14: row.age_14_or_older === true,
      privacy: row.privacy_consent === true,
      photoAndTime: row.photo_time_consent === true,
      location: row.location_consent === true,
      consentVersion: row.consent_version ?? 'unknown',
    }
  }

  const updateLocationConsent = async (
    session: CashlogSession,
    location: boolean,
  ): Promise<void> => {
    if (!config) throw new Error('로그인 서비스 연결이 아직 완료되지 않았어요.')
    const user = session.user ?? (await getUser(session))
    if (!user?.id) throw new Error('계정 정보를 확인하지 못했어요.')
    const endpoint = new URL(`${config.url}/rest/v1/cashlog_user_consents`)
    endpoint.searchParams.set('user_id', `eq.${user.id}`)
    endpoint.searchParams.set('app_id', 'eq.cashlog')
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        ...authHeaders(config, session.accessToken),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        location_consent: location,
        consent_version: CASHLOG_CONSENT_VERSION,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) {
      throw new Error(
        await readAuthError(response, '위치 정보 동의 설정을 변경하지 못했어요.'),
      )
    }
  }

  const signUpWithPassword = async (
    email: string,
    password: string,
    consents: SignupConsents,
  ): Promise<CashlogSession | null> => {
    if (!config) throw new Error('Supabase 환경변수가 설정되지 않았어요.')
    const endpoint = new URL(`${config.url}/auth/v1/signup`)
    const redirectTo = redirectTarget()
    if (redirectTo) endpoint.searchParams.set('redirect_to', redirectTo)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({
        email,
        password,
        data: {
          app_id: 'cashlog',
          consent_version: CASHLOG_CONSENT_VERSION,
          consented_at: new Date().toISOString(),
          age_14_or_older: consents.age14,
          privacy_consent: consents.privacy,
          photo_time_consent: consents.photoAndTime,
          location_consent: consents.location,
        },
      }),
    })
    if (!response.ok) {
      throw new Error(await readAuthError(response, '회원가입 요청에 실패했어요.'))
    }
    const body = (await response.json()) as SupabaseAuthBody
    return sessionFromAuthBody(body)
  }

  const getUser = async (session: CashlogSession): Promise<CashlogUser | undefined> => {
    if (!config) return undefined
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: authHeaders(config, session.accessToken),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as { id?: string; email?: string }
    if (!body.id) return undefined
    return { id: body.id, ...(body.email ? { email: body.email } : {}) }
  }

  const hydrateSession = async (session: CashlogSession): Promise<CashlogSession> => {
    const user = session.user ?? (await getUser(session))
    return user ? { ...session, user } : session
  }

  const signOut = () => saveSession(null)

  return {
    isConfigured: Boolean(config),
    config,
    loadStoredSession,
    saveSession,
    consumeSessionFromUrl,
    signInWithEmail,
    signInWithPassword,
    getOAuthAuthorizeUrl,
    signInWithOAuth,
    signUpWithPassword,
    persistPendingOAuthConsent,
    getSignupConsents,
    updateLocationConsent,
    hydrateSession,
    signOut,
  }
}
