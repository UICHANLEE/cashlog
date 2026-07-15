import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../../server/httpSecurity.js'
import { clearSessionCookies } from '../../../server/auth/cookies.js'
import { ApiError, requireMethod, readJson, sendError } from '../../../server/auth/http.js'
import { requireAuthUser, signOutEverywhere, updateAuthPassword } from '../../../server/auth/supabase.js'
import { validatePassword } from '../../../server/auth/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'PATCH')
    const { user, accessToken } = await requireAuthUser(req)
    const body = readJson<{ password?: string; passwordConfirm?: string }>(req)
    const password = validatePassword(body.password, user.email)
    if (password !== body.passwordConfirm) {
      throw new ApiError(400, 'PASSWORD_MISMATCH', '비밀번호 확인이 일치하지 않아요.', 'passwordConfirm')
    }
    await updateAuthPassword(accessToken, password)
    await signOutEverywhere(accessToken)
    clearSessionCookies(res)
    res.status(200).json({ success: true, message: '비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.' })
  } catch (error) {
    sendError(res, error)
  }
}
