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

  const consumeSessionFromUrl = (): CashlogSession | null => {
    if (!config || typeof window === 'undefined') return null
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash.includes('access_token=')) return null
    const session = parseSessionPayload(new URLSearchParams(hash))
    if (session) {
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search)
    }
    return session
  }

  const signInWithEmail = async (email: string) => {
    if (!config) throw new Error('Supabase 환경변수가 설정되지 않았어요.')
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
    const response = await fetch(`${config.url}/auth/v1/otp`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({
        email,
        create_user: true,
        options: redirectTo ? { email_redirect_to: redirectTo } : undefined,
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || '로그인 메일을 보낼 수 없어요.')
    }
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
    hydrateSession,
    signOut,
  }
}

