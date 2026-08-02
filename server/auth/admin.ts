import type { VercelRequest } from '@vercel/node'
import { ApiError } from './http.js'
import { requireAuthUser } from './supabase.js'

export const getAdminEmails = () => new Set(
  String(process.env.CASHLOG_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

export const requireAdminUser = async (req: VercelRequest) => {
  const allowed = getAdminEmails()
  if (allowed.size === 0) {
    throw new ApiError(503, 'ADMIN_NOT_CONFIGURED', '관리자 계정 설정이 필요해요.')
  }
  const authenticated = await requireAuthUser(req)
  const email = authenticated.user.email?.trim().toLowerCase()
  if (!email || !allowed.has(email)) {
    throw new ApiError(403, 'ADMIN_FORBIDDEN', '이 계정에는 관리자 권한이 없어요.')
  }
  return authenticated
}
