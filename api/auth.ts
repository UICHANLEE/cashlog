import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../server/httpSecurity.js'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
  clearSessionCookies,
  readCookies,
  setSessionCookies,
} from '../server/auth/cookies.js'
import { ApiError, readJson, requireMethod, sendError } from '../server/auth/http.js'
import { toProfileResponse } from '../server/auth/profileResponse.js'
import {
  authLogin,
  authRefresh,
  authRequestPasswordReset,
  enforceRateLimit,
  ensureProfile,
  getAuthUser,
  patchProfile,
  requireAuthUser,
  signOutEverywhere,
  updateAuthPassword,
} from '../server/auth/supabase.js'
import { validateEmail, validatePassword } from '../server/auth/validation.js'

type AuthAction =
  | 'login'
  | 'logout'
  | 'me'
  | 'password-reset-request'
  | 'password-reset'
  | 'refresh'
  | 'session'

type AuthHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>

const AUTH_ACTIONS = new Set<AuthAction>([
  'login',
  'logout',
  'me',
  'password-reset-request',
  'password-reset',
  'refresh',
  'session',
])

const readAuthAction = (value: string | string[] | undefined): AuthAction | null => {
  if (typeof value !== 'string' || !AUTH_ACTIONS.has(value as AuthAction)) return null
  return value as AuthAction
}

const login: AuthHandler = async (req, res) => {
  requireMethod(req, 'POST')
  await enforceRateLimit(req, 'login', 8, 900)
  const body = readJson<{ email?: string; password?: string; remember?: boolean }>(req)
  const email = validateEmail(body.email)
  const session = await authLogin(email, String(body.password || ''))
  const user = session.user!
  const profile = await ensureProfile(user)
  const updated = await patchProfile(user.id, { last_login_at: new Date().toISOString() })
  setSessionCookies(res, session, body.remember === true)
  res.status(200).json({
    success: true,
    message: '로그인했어요.',
    accessToken: session.access_token,
    expiresIn: session.expires_in,
    user: await toProfileResponse(user, updated || profile),
  })
}

const logout: AuthHandler = async (req, res) => {
  requireMethod(req, 'POST')
  const token = readCookies(req)[ACCESS_COOKIE]
  if (token) await signOutEverywhere(token)
  clearSessionCookies(res)
  res.status(200).json({ success: true, message: '로그아웃했어요.' })
}

const me: AuthHandler = async (req, res) => {
  requireMethod(req, 'GET')
  const { user, accessToken } = await requireAuthUser(req)
  const profile = await ensureProfile(user)
  res.status(200).json({ success: true, accessToken, user: await toProfileResponse(user, profile) })
}

const requestPasswordReset: AuthHandler = async (req, res) => {
  requireMethod(req, 'POST')
  await enforceRateLimit(req, 'password-reset-request', 5, 3600)
  const body = readJson<{ email?: string }>(req)
  const email = validateEmail(body.email)
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  await authRequestPasswordReset(email, origin)
  res.status(200).json({
    success: true,
    message: '가입된 이메일이라면 비밀번호 재설정 링크를 보냈어요.',
  })
}

const resetPassword: AuthHandler = async (req, res) => {
  requireMethod(req, 'PATCH')
  await enforceRateLimit(req, 'password-reset', 8, 3600)
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization
  const accessToken = String(authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) {
    throw new ApiError(401, 'INVALID_RESET_LINK', '재설정 링크가 만료됐거나 올바르지 않아요.')
  }
  const body = readJson<{ password?: string; passwordConfirm?: string }>(req)
  const password = validatePassword(body.password)
  if (password !== body.passwordConfirm) {
    throw new ApiError(400, 'PASSWORD_MISMATCH', '비밀번호 확인이 일치하지 않아요.', 'passwordConfirm')
  }
  await updateAuthPassword(accessToken, password)
  await signOutEverywhere(accessToken)
  clearSessionCookies(res)
  res.status(200).json({ success: true, message: '비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.' })
}

const refresh: AuthHandler = async (req, res) => {
  requireMethod(req, 'POST')
  const cookies = readCookies(req)
  if (!cookies[REFRESH_COOKIE]) {
    throw new ApiError(401, 'SESSION_EXPIRED', '로그인 시간이 만료됐어요. 다시 로그인해 주세요.')
  }
  const session = await authRefresh(cookies[REFRESH_COOKIE])
  setSessionCookies(res, session, cookies[REMEMBER_COOKIE] === '1')
  res.status(200).json({ success: true, accessToken: session.access_token, expiresIn: session.expires_in })
}

const exchangeSession: AuthHandler = async (req, res) => {
  requireMethod(req, 'POST')
  await enforceRateLimit(req, 'session_exchange', 20, 900)
  const body = readJson<{ refreshToken?: string; remember?: boolean }>(req)
  const refreshToken = String(body.refreshToken || '')
  if (!refreshToken || refreshToken.length > 8192) {
    throw new ApiError(400, 'INVALID_SESSION', '로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.')
  }

  const session = await authRefresh(refreshToken)
  const user = session.user ?? await getAuthUser(session.access_token)
  const profile = await ensureProfile(user)
  setSessionCookies(res, session, body.remember !== false)
  res.status(200).json({
    success: true,
    message: '안전한 로그인 세션을 만들었어요.',
    accessToken: session.access_token,
    expiresIn: session.expires_in,
    user: await toProfileResponse(user, profile),
  })
}

const handlers: Record<AuthAction, AuthHandler> = {
  login,
  logout,
  me,
  'password-reset-request': requestPasswordReset,
  'password-reset': resetPassword,
  refresh,
  session: exchangeSession,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  const action = readAuthAction(req.query.action)
  if (!action) {
    res.status(404).json({
      success: false,
      code: 'AUTH_ROUTE_NOT_FOUND',
      message: '인증 요청 경로를 찾을 수 없어요.',
    })
    return
  }

  try {
    await handlers[action](req, res)
  } catch (error) {
    if (action === 'logout' || action === 'refresh') clearSessionCookies(res)
    sendError(res, error)
  }
}
