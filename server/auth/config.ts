import { ApiError } from './http.js'

export type ServerSupabaseConfig = {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export const getServerSupabaseConfig = (): ServerSupabaseConfig => {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const anonKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !anonKey || !serviceRoleKey) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '로그인 서비스 설정이 아직 완료되지 않았어요.')
  }
  return { url, anonKey, serviceRoleKey }
}
