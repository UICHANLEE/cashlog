import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { ACCESS_COOKIE, clearSessionCookies, readCookies } from '../../server/auth/cookies.js'
import { requireMethod, sendError } from '../../server/auth/http.js'
import { signOutEverywhere } from '../../server/auth/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'POST')
    const token = readCookies(req)[ACCESS_COOKIE]
    if (token) await signOutEverywhere(token)
    clearSessionCookies(res)
    res.status(200).json({ success: true, message: '로그아웃했어요.' })
  } catch (error) {
    clearSessionCookies(res)
    sendError(res, error)
  }
}
