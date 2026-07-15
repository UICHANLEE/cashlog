import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { requireMethod, sendError } from '../../server/auth/http.js'
import { toProfileResponse } from '../../server/auth/profileResponse.js'
import { ensureProfile, requireAuthUser } from '../../server/auth/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'GET')
    const { user, accessToken } = await requireAuthUser(req)
    const profile = await ensureProfile(user)
    res.status(200).json({ success: true, accessToken, user: await toProfileResponse(user, profile) })
  } catch (error) {
    sendError(res, error)
  }
}
