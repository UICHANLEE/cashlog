import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { requireMethod, readJson, sendError } from '../../server/auth/http.js'
import { authRequestPasswordReset, enforceRateLimit } from '../../server/auth/supabase.js'
import { validateEmail } from '../../server/auth/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
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
  } catch (error) {
    sendError(res, error)
  }
}
