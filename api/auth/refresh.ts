import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { REFRESH_COOKIE, REMEMBER_COOKIE, clearSessionCookies, readCookies, setSessionCookies } from '../../server/auth/cookies.js'
import { ApiError, requireMethod, sendError } from '../../server/auth/http.js'
import { authRefresh } from '../../server/auth/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'POST')
    const cookies = readCookies(req)
    if (!cookies[REFRESH_COOKIE]) throw new ApiError(401, 'SESSION_EXPIRED', '로그인 시간이 만료됐어요. 다시 로그인해 주세요.')
    const session = await authRefresh(cookies[REFRESH_COOKIE])
    setSessionCookies(res, session, cookies[REMEMBER_COOKIE] === '1')
    res.status(200).json({ success: true, accessToken: session.access_token, expiresIn: session.expires_in })
  } catch (error) {
    clearSessionCookies(res)
    sendError(res, error)
  }
}
