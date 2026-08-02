export type AccountUser = {
  id: string
  email: string
  nickname: string
  profileImageUrl: string | null
  status: string
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type ErrorBody = { code?: string; message?: string; field?: string }

export class AccountApiError extends Error {
  code: string
  field?: string
  status: number

  constructor(status: number, body: ErrorBody) {
    super(body.message || '요청을 처리하지 못했어요.')
    this.status = status
    this.code = body.code || 'REQUEST_FAILED'
    this.field = body.field
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response
  try {
    response = await fetch(path, { ...init, credentials: 'include' })
  } catch {
    throw new AccountApiError(0, { code: 'NETWORK_ERROR', message: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.' })
  }
  const body = await response.json().catch(() => ({})) as T & ErrorBody
  if (!response.ok) {
    const fallback = response.status >= 500
      ? '서버가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.'
      : '요청을 처리하지 못했어요.'
    throw new AccountApiError(response.status, { ...body, message: body.message || fallback })
  }
  return body
}

export type SessionResponse = {
  success: true
  message?: string
  accessToken?: string
  expiresIn?: number
  requiresEmailVerification?: boolean
  user: AccountUser
}

export const signup = (form: FormData) => request<SessionResponse>('/api/auth/signup', { method: 'POST', body: form })

export const login = (email: string, password: string, remember: boolean) =>
  request<SessionResponse>('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, remember }),
  })

export const logout = () => request<{ success: true; message: string }>('/api/auth/logout', { method: 'POST' })

export const requestPasswordReset = (email: string) =>
  request<{ success: true; message: string }>('/api/auth/password-reset-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  })

export const resetPassword = (accessToken: string, password: string, passwordConfirm: string) =>
  request<{ success: true; message: string }>('/api/auth/password-reset', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password, passwordConfirm }),
  })

export const refreshSession = () => request<{ success: true; accessToken: string; expiresIn?: number }>('/api/auth/refresh', { method: 'POST' })

export const exchangeSession = (refreshToken: string, remember = true) =>
  request<SessionResponse>('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, remember }),
  })

export const getMe = async () => {
  try {
    return await request<SessionResponse>('/api/auth/me')
  } catch (error) {
    if (!(error instanceof AccountApiError) || error.status !== 401) throw error
    await refreshSession()
    return request<SessionResponse>('/api/auth/me')
  }
}

export const updateProfile = (form: FormData) => request<SessionResponse>('/api/users/me', { method: 'PATCH', body: form })

export const changePassword = (password: string, passwordConfirm: string) =>
  request<{ success: true; message: string }>('/api/users/me/password', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, passwordConfirm }),
  })

export const deleteAccount = () => request<{ success: true; message: string }>('/api/users/me', { method: 'DELETE' })
