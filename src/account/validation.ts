import { assertValidImageFile } from '../media/imageSignature'

export type FieldErrors = Record<string, string>
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const passwordChecks = (password: string, email = '') => ({
  length: password.length >= 8,
  groups: [/[A-Za-z]/.test(password), /\d/.test(password), /[^A-Za-z\d]/.test(password)].filter(Boolean).length >= 2,
  personal: !email.split('@')[0] || !password.toLowerCase().includes(email.split('@')[0].toLowerCase()),
})

export const validateProfileImage = async (file: File) => {
  if (file.size > 5 * 1024 * 1024) throw new Error('프로필 이미지는 5MB 이하만 사용할 수 있어요.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지만 사용할 수 있어요.')
  await assertValidImageFile(file)
  const bitmap = await createImageBitmap(file)
  const valid = bitmap.width <= 4000 && bitmap.height <= 4000
  bitmap.close()
  if (!valid) throw new Error('이미지 크기는 가로·세로 4000px 이하여야 해요.')
}

export const validateSignup = (values: {
  nickname: string; email: string; password: string; passwordConfirm: string; age14: boolean;
  terms: boolean; privacy: boolean; photoAndTime: boolean; location: boolean
}) => {
  const errors: FieldErrors = {}
  if (values.nickname.trim().length < 2 || values.nickname.trim().length > 30) errors.nickname = '닉네임은 2~30자로 입력해 주세요.'
  if (!emailPattern.test(values.email.trim())) errors.email = '올바른 이메일 주소를 입력해 주세요.'
  const checks = passwordChecks(values.password, values.email)
  if (!checks.length || !checks.groups || !checks.personal) errors.password = '안전한 비밀번호 조건을 확인해 주세요.'
  if (values.password !== values.passwordConfirm) errors.passwordConfirm = '비밀번호가 일치하지 않아요.'
  if (!values.age14) errors.age14Consent = '만 14세 이상 확인이 필요해요.'
  if (!values.terms) errors.termsConsent = '이용약관 동의가 필요해요.'
  if (!values.privacy) errors.privacyConsent = '개인정보 처리방침 동의가 필요해요.'
  if (!values.photoAndTime) errors.photoTimeConsent = '사진과 기록 시간 처리 동의가 필요해요.'
  return errors
}

export const validateLogin = (email: string, password: string) => {
  const errors: FieldErrors = {}
  if (!emailPattern.test(email.trim())) errors.email = '올바른 이메일 주소를 입력해 주세요.'
  if (!password) errors.password = '비밀번호를 입력해 주세요.'
  return errors
}

export const validateNicknameInput = (nickname: string) => {
  const normalized = nickname.trim().replace(/\s+/g, ' ')
  if (normalized.length < 2 || normalized.length > 30 || !/^[\p{L}\p{N}_ .-]+$/u.test(normalized)) {
    return '닉네임은 2~30자의 한글, 영문, 숫자로 입력해 주세요.'
  }
  return ''
}
