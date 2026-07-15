import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { setSessionCookies } from '../../server/auth/cookies.js'
import { requireMethod, readJson, sendError } from '../../server/auth/http.js'
import { toProfileResponse } from '../../server/auth/profileResponse.js'
import { authLogin, enforceRateLimit, ensureProfile, patchProfile } from '../../server/auth/supabase.js'
import { validateEmail } from '../../server/auth/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'POST')
    await enforceRateLimit(req, 'login', 8, 900)
    const body = readJson<{ email?: string; password?: string; remember?: boolean }>(req)
    const email = validateEmail(body.email)
    const session = await authLogin(email, String(body.password || ''))
    const user = session.user!
    const profile = await ensureProfile(user)
    const updated = await patchProfile(user.id, { last_login_at: new Date().toISOString() })
    setSessionCookies(res, session, body.remember === true)
    res.status(200).json({ success: true, message: '로그인했어요.', accessToken: session.access_token, expiresIn: session.expires_in, user: await toProfileResponse(user, updated || profile) })
  } catch (error) {
    sendError(res, error)
  }
}
