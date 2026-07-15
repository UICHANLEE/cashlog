import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { setSessionCookies } from '../../server/auth/cookies.js'
import { prepareProfileImage } from '../../server/auth/image.js'
import { ApiError, requireMethod, sendError } from '../../server/auth/http.js'
import { parseMultipart } from '../../server/auth/multipart.js'
import { toProfileResponse } from '../../server/auth/profileResponse.js'
import { authSignup, deleteAuthUser, deleteProfileImage, enforceRateLimit, getProfile, uploadProfileImage, upsertProfile } from '../../server/auth/supabase.js'
import { validateSignupFields } from '../../server/auth/validation.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    requireMethod(req, 'POST')
    await enforceRateLimit(req, 'signup', 5, 3600)
    const { fields, profileImage } = await parseMultipart(req, [
      'email', 'password', 'passwordConfirm', 'nickname', 'age14Consent', 'termsConsent', 'privacyConsent',
    ])
    const values = validateSignupFields(fields)
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const session = await authSignup(values.email, values.password, values.nickname, origin)
    if (!session.user?.id) throw new ApiError(503, 'SIGNUP_FAILED', '계정 정보를 확인하지 못했어요.')

    let uploadedPath: string | null = null
    try {
      if (profileImage?.buffer.length) {
        const prepared = await prepareProfileImage(profileImage)
        uploadedPath = await uploadProfileImage(session.user.id, prepared.filename, prepared.buffer)
      }
      await upsertProfile({
        user_id: session.user.id,
        email: values.email,
        nickname: values.nickname,
        profile_image_path: uploadedPath,
        profile_image_url: uploadedPath ? `storage://cashlog-profiles/${uploadedPath}` : null,
        status: 'ACTIVE',
        email_verified_at: session.user.email_confirmed_at || session.user.confirmed_at || null,
      })
    } catch (error) {
      await deleteProfileImage(uploadedPath)
      await deleteAuthUser(session.user.id)
      throw error
    }

    if (session.access_token && session.refresh_token) setSessionCookies(res, session, true)
    const profile = await getProfile(session.user.id)
    res.status(201).json({
      success: true,
      message: session.access_token ? '회원가입이 완료되었습니다.' : '가입 확인 메일을 보냈어요. 메일 인증을 완료해 주세요.',
      requiresEmailVerification: !session.access_token,
      user: await toProfileResponse(session.user, profile),
      ...(session.access_token ? { accessToken: session.access_token, expiresIn: session.expires_in } : {}),
    })
  } catch (error) {
    sendError(res, error)
  }
}
