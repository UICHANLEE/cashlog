import { createHash } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { getServerSupabaseConfig } from './config.js'
import { ACCESS_COOKIE, readCookies } from './cookies.js'
import { ApiError, clientIp } from './http.js'
import { resolveServerStorageSignedUrl } from './storageUrl.js'

type SupabaseSession = {
  access_token: string
  refresh_token: string
  expires_in?: number
  user?: SupabaseUser
}

export type SupabaseUser = {
  id: string
  email?: string
  created_at?: string
  email_confirmed_at?: string
  confirmed_at?: string
  identities?: unknown[]
}

export type CashlogProfile = {
  user_id: string
  email: string
  nickname: string
  profile_image_url: string | null
  profile_image_path: string | null
  status: string
  email_verified_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const parseResponse = async (response: Response) => {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) as unknown } catch { return { message: text } }
}

const messageFrom = (body: unknown) => {
  if (!body || typeof body !== 'object') return ''
  const value = body as Record<string, unknown>
  return String(value.msg || value.message || value.error_description || value.error || '')
}

const headers = (key: string, token = key, extra?: Record<string, string>) => ({
  apikey: key,
  Authorization: `Bearer ${token}`,
  ...extra,
})

export const authSignup = async (
  email: string,
  password: string,
  nickname: string,
  consents: { photoAndTime: true; location: boolean },
  origin?: string,
) => {
  const config = getServerSupabaseConfig()
  const endpoint = new URL(`${config.url}/auth/v1/signup`)
  if (origin) endpoint.searchParams.set('redirect_to', `${origin}/login.html?verified=1`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers(config.anonKey, config.anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      email,
      password,
      data: {
        app_id: 'cashlog', nickname, consent_version: '2026-07-26', consented_at: new Date().toISOString(),
        age_14_or_older: true, privacy_consent: true,
        photo_time_consent: consents.photoAndTime, location_consent: consents.location,
      },
    }),
  })
  const body = await parseResponse(response)
  if (!response.ok) {
    const message = messageFrom(body).toLowerCase()
    if (message.includes('already') || message.includes('registered') || response.status === 422) {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', '이미 사용 중인 이메일입니다.', 'email')
    }
    throw new ApiError(400, 'SIGNUP_FAILED', '회원가입을 완료하지 못했어요. 입력 내용을 확인해 주세요.')
  }
  const session = body as SupabaseSession & { user: SupabaseUser }
  if (Array.isArray(session.user?.identities) && session.user.identities.length === 0) {
    throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', '이미 사용 중인 이메일입니다.', 'email')
  }
  return session
}

export const authLogin = async (email: string, password: string) => {
  const config = getServerSupabaseConfig()
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(config.anonKey, config.anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  })
  const body = await parseResponse(response)
  if (!response.ok) throw new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.')
  return body as SupabaseSession
}

export const authRefresh = async (refreshToken: string) => {
  const config = getServerSupabaseConfig()
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: headers(config.anonKey, config.anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const body = await parseResponse(response)
  if (!response.ok) throw new ApiError(401, 'SESSION_EXPIRED', '로그인 시간이 만료됐어요. 다시 로그인해 주세요.')
  return body as SupabaseSession
}

export const getAuthUser = async (accessToken: string) => {
  const config = getServerSupabaseConfig()
  const response = await fetch(`${config.url}/auth/v1/user`, { headers: headers(config.anonKey, accessToken) })
  if (!response.ok) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요해요.')
  return (await response.json()) as SupabaseUser
}

export const requireAuthUser = async (req: VercelRequest) => {
  const token = readCookies(req)[ACCESS_COOKIE]
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요해요.')
  return { user: await getAuthUser(token), accessToken: token }
}

export const serviceRequest = async (path: string, init?: RequestInit) => {
  const config = getServerSupabaseConfig()
  return fetch(`${config.url}${path}`, {
    ...init,
    headers: { ...headers(config.serviceRoleKey), ...(init?.headers || {}) },
  })
}

export const getProfile = async (userId: string) => {
  const response = await serviceRequest(`/rest/v1/cashlog_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`)
  if (!response.ok) throw new ApiError(503, 'DATABASE_UNAVAILABLE', '프로필을 불러오지 못했어요.')
  const rows = (await response.json()) as CashlogProfile[]
  return rows[0] || null
}

export const upsertProfile = async (profile: Partial<CashlogProfile> & { user_id: string; email: string; nickname: string }) => {
  const response = await serviceRequest('/rest/v1/cashlog_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new ApiError(503, 'PROFILE_SAVE_FAILED', '프로필을 저장하지 못했어요.')
  return ((await response.json()) as CashlogProfile[])[0]
}

export const ensureProfile = async (user: SupabaseUser) => {
  const existing = await getProfile(user.id)
  if (existing?.status === 'DELETED') {
    throw new ApiError(403, 'ACCOUNT_DELETED', '탈퇴한 Cashlog 계정이에요. 도움이 필요하면 고객지원에 문의해 주세요.')
  }
  if (existing) return existing
  const emailName = user.email?.split('@')[0]?.trim() || ''
  return upsertProfile({
    user_id: user.id,
    email: (user.email || '').toLowerCase(),
    nickname: emailName.length >= 2 ? emailName.slice(0, 30) : 'Cashlogger',
    status: 'ACTIVE',
    email_verified_at: user.email_confirmed_at || user.confirmed_at || null,
  })
}

export const patchProfile = async (userId: string, patch: Partial<CashlogProfile>) => {
  const response = await serviceRequest(`/rest/v1/cashlog_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new ApiError(503, 'PROFILE_SAVE_FAILED', '프로필을 저장하지 못했어요.')
  return ((await response.json()) as CashlogProfile[])[0]
}

export const uploadProfileImage = async (userId: string, filename: string, buffer: Buffer) => {
  const path = `${userId}/${filename}`
  const response = await serviceRequest(`/storage/v1/object/cashlog-profiles/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' },
    body: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  })
  if (!response.ok) throw new ApiError(503, 'IMAGE_UPLOAD_FAILED', '프로필 이미지를 저장하지 못했어요.', 'profileImage')
  return path
}

export const deleteProfileImage = async (path: string | null | undefined) => {
  if (!path) return
  await serviceRequest('/storage/v1/object/cashlog-profiles', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  })
}

export const signedProfileImageUrl = async (path: string | null) => {
  if (!path) return null
  const response = await serviceRequest(`/storage/v1/object/sign/cashlog-profiles/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }),
  })
  if (!response.ok) return null
  const body = await response.json() as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL || body.signedUrl
  if (!signed) return null
  const config = getServerSupabaseConfig()
  return resolveServerStorageSignedUrl(config.url, signed)
}

export const updateAuthPassword = async (accessToken: string, password: string) => {
  const config = getServerSupabaseConfig()
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: 'PUT', headers: headers(config.anonKey, accessToken, { 'Content-Type': 'application/json' }), body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new ApiError(400, 'PASSWORD_UPDATE_FAILED', '비밀번호를 변경하지 못했어요.')
}

export const deleteAuthUser = async (userId: string) => {
  const response = await serviceRequest(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' })
  if (!response.ok) throw new ApiError(503, 'ACCOUNT_DELETE_FAILED', '회원탈퇴를 완료하지 못했어요.')
}

export const deleteCashlogAccountData = async (userId: string) => {
  const response = await serviceRequest('/rest/v1/rpc/cashlog_delete_account_data', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_id: userId }),
  })
  if (!response.ok) throw new ApiError(503, 'ACCOUNT_DELETE_FAILED', '회원탈퇴를 완료하지 못했어요.')
}

export const signOutEverywhere = async (accessToken: string) => {
  const config = getServerSupabaseConfig()
  await fetch(`${config.url}/auth/v1/logout?scope=global`, { method: 'POST', headers: headers(config.anonKey, accessToken) })
}

export const enforceRateLimit = async (req: VercelRequest, action: string, limit: number, windowSeconds: number) => {
  const salt = process.env.AUTH_RATE_LIMIT_SALT || 'cashlog-local-only'
  const identifier = createHash('sha256').update(`${salt}:${clientIp(req)}`).digest('hex')
  const response = await serviceRequest('/rest/v1/rpc/cashlog_check_rate_limit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: identifier, p_action: action, p_limit: limit, p_window_seconds: windowSeconds }),
  })
  if (!response.ok) throw new ApiError(503, 'RATE_LIMIT_UNAVAILABLE', '잠시 후 다시 시도해 주세요.')
  if ((await response.json()) !== true) throw new ApiError(429, 'TOO_MANY_REQUESTS', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')
}
