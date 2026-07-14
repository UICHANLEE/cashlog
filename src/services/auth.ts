import { getSupabaseConfig, type SupabaseConfig } from './supabaseConfig'

const SESSION_STORAGE_KEY = 'cashlog.supabase.session'

export type CashlogUser = {
  id: string
  email: string
}

export type CashlogSession = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  user?: CashlogUser
}

export const CASHLOG_CONSENT_VERSION = '2026-07-14'

export type SignupConsents = {
  age14: true
  privacy: true
  photoAndTime: true
  location: boolean
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
  const user =
    body.user?.id && body.user?.email
      ? { id: body.user.id, email: body.user.email }
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
    if (!body.id || !body.email) return undefined
    return { id: body.id, email: body.email }
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
    signUpWithPassword,
    hydrateSession,
    signOut,
  }
}
