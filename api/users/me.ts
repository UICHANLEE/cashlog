import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity.js'
import { clearSessionCookies } from '../../server/auth/cookies.js'
import { prepareProfileImage } from '../../server/auth/image.js'
import { ApiError, sendError } from '../../server/auth/http.js'
import { parseMultipart } from '../../server/auth/multipart.js'
import { toProfileResponse } from '../../server/auth/profileResponse.js'
import { deleteCashlogAccountData, deleteProfileImage, getProfile, patchProfile, requireAuthUser, signOutEverywhere, uploadProfileImage } from '../../server/auth/supabase.js'
import { validateNickname } from '../../server/auth/validation.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  try {
    if (req.method === 'PATCH') {
      const { user } = await requireAuthUser(req)
      const current = await getProfile(user.id)
      if (!current) throw new ApiError(404, 'PROFILE_NOT_FOUND', '프로필을 찾을 수 없어요.')
      const { fields, profileImage } = await parseMultipart(req, ['nickname', 'removeProfileImage'])
      const nickname = fields.nickname ? validateNickname(fields.nickname) : current.nickname
      let nextPath = current.profile_image_path
      let uploadedPath: string | null = null

      if (profileImage?.buffer.length) {
        const prepared = await prepareProfileImage(profileImage)
        uploadedPath = await uploadProfileImage(user.id, prepared.filename, prepared.buffer)
        nextPath = uploadedPath
      } else if (fields.removeProfileImage === 'true') {
        nextPath = null
      }

      let updated
      try {
        updated = await patchProfile(user.id, {
          nickname,
          profile_image_path: nextPath,
          profile_image_url: nextPath ? `storage://cashlog-profiles/${nextPath}` : null,
        })
      } catch (error) {
        await deleteProfileImage(uploadedPath)
        throw error
      }
      if (current.profile_image_path && current.profile_image_path !== nextPath) {
        await deleteProfileImage(current.profile_image_path)
      }
      res.status(200).json({ success: true, message: '프로필을 저장했어요.', user: await toProfileResponse(user, updated) })
      return
    }

    if (req.method === 'DELETE') {
      const { user, accessToken } = await requireAuthUser(req)
      const profile = await getProfile(user.id)
      await deleteCashlogAccountData(user.id)
      await deleteProfileImage(profile?.profile_image_path)
      await signOutEverywhere(accessToken)
      clearSessionCookies(res)
      res.status(200).json({ success: true, message: '회원탈퇴가 완료됐어요.' })
      return
    }

    throw new ApiError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식이에요.')
  } catch (error) {
    sendError(res, error)
  }
}
