import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { setSessionCookies } from '../../server/auth/cookies.js'
import { ApiError, readJson, requireMethod, sendError } from '../../server/auth/http.js'
import { toProfileResponse } from '../../server/auth/profileResponse.js'
import {
  authRefresh,
  enforceRateLimit,
  ensureProfile,
  getAuthUser,
} from '../../server/auth/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'POST')
    await enforceRateLimit(req, 'session_exchange', 20, 900)
    const body = readJson<{ refreshToken?: string; remember?: boolean }>(req)
    const refreshToken = String(body.refreshToken || '')
    if (!refreshToken || refreshToken.length > 8192) {
      throw new ApiError(400, 'INVALID_SESSION', '로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.')
    }

    // Supabase validates and rotates the callback token before it becomes a cookie session.
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
  } catch (error) {
    sendError(res, error)
  }
}
