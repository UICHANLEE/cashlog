import type { CashlogProfile, SupabaseUser } from './supabase.js'
import { signedProfileImageUrl } from './supabase.js'

export const toProfileResponse = async (user: SupabaseUser, profile: CashlogProfile | null) => ({
  id: user.id,
  email: user.email || profile?.email || '',
  nickname: profile?.nickname || user.email?.split('@')[0] || 'Cashlogger',
  profileImageUrl: await signedProfileImageUrl(profile?.profile_image_path || null),
  status: profile?.status || 'ACTIVE',
  emailVerifiedAt: user.email_confirmed_at || user.confirmed_at || profile?.email_verified_at || null,
  lastLoginAt: profile?.last_login_at || null,
  createdAt: profile?.created_at || user.created_at || new Date().toISOString(),
  updatedAt: profile?.updated_at || user.created_at || new Date().toISOString(),
})
