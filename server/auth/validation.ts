import { ApiError } from './http.js'

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NICKNAME_PATTERN = /^[\p{L}\p{N}_ .-]+$/u
const SIMPLE_PASSWORDS = new Set(['password', 'password1', '12345678', 'qwerty123', 'cashlog1'])

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export const validateEmail = (value: unknown) => {
  const email = normalizeEmail(value)
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, 'INVALID_EMAIL', '올바른 이메일 주소를 입력해 주세요.', 'email')
  }
  return email
}

export const validateNickname = (value: unknown) => {
  const nickname = String(value || '').trim().replace(/\s+/g, ' ')
  if (nickname.length < 2 || nickname.length > 30 || !NICKNAME_PATTERN.test(nickname)) {
    throw new ApiError(400, 'INVALID_NICKNAME', '닉네임은 2~30자의 한글, 영문, 숫자로 입력해 주세요.', 'nickname')
  }
  return nickname
}

export const validatePassword = (value: unknown, email?: string) => {
  const password = String(value || '')
  const groups = [/[A-Za-z]/.test(password), /\d/.test(password), /[^A-Za-z\d]/.test(password)].filter(Boolean).length
  const emailName = email?.split('@')[0]?.toLowerCase()
  if (password.length < 8 || password.length > 128 || groups < 2) {
    throw new ApiError(400, 'WEAK_PASSWORD', '비밀번호는 8자 이상이며 영문, 숫자, 특수문자 중 2가지를 포함해야 해요.', 'password')
  }
  if (SIMPLE_PASSWORDS.has(password.toLowerCase()) || (emailName && emailName.length >= 4 && password.toLowerCase().includes(emailName))) {
    throw new ApiError(400, 'WEAK_PASSWORD', '이메일과 다르고 추측하기 어려운 비밀번호를 사용해 주세요.', 'password')
  }
  return password
}

export const validateSignupFields = (fields: Record<string, string>) => {
  const email = validateEmail(fields.email)
  const nickname = validateNickname(fields.nickname)
  const password = validatePassword(fields.password, email)
  if (password !== fields.passwordConfirm) {
    throw new ApiError(400, 'PASSWORD_MISMATCH', '비밀번호 확인이 일치하지 않아요.', 'passwordConfirm')
  }
  if (fields.termsConsent !== 'true') {
    throw new ApiError(400, 'TERMS_REQUIRED', '이용약관에 동의해 주세요.', 'termsConsent')
  }
  if (fields.age14Consent !== 'true') {
    throw new ApiError(400, 'AGE_CONSENT_REQUIRED', '만 14세 이상 확인이 필요해요.', 'age14Consent')
  }
  if (fields.privacyConsent !== 'true') {
    throw new ApiError(400, 'PRIVACY_REQUIRED', '개인정보 처리방침에 동의해 주세요.', 'privacyConsent')
  }
  return { email, nickname, password }
}
