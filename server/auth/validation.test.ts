import { describe, expect, it } from 'vitest'
import { ApiError } from './http'
import { normalizeEmail, validateNickname, validatePassword, validateSignupFields } from './validation'

describe('account validation', () => {
  it('normalizes email and accepts a strong password', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com')
    expect(validatePassword('cashLOG!2026', 'me@example.com')).toBe('cashLOG!2026')
    expect(validateNickname('  현명한 소비  ')).toBe('현명한 소비')
  })

  it('rejects a weak or email-derived password', () => {
    expect(() => validatePassword('12345678', 'me@example.com')).toThrow(ApiError)
    expect(() => validatePassword('uichan2026!', 'uichan@example.com')).toThrow('이메일과 다르고')
  })

  it('requires matching passwords and both agreements', () => {
    expect(() => validateSignupFields({
      email: 'me@example.com', nickname: '캐시로그', password: 'Cashlog!2026', passwordConfirm: 'different1!',
      age14Consent: 'true', termsConsent: 'true', privacyConsent: 'true',
      photoTimeConsent: 'true',
    })).toThrow('비밀번호 확인')
    expect(() => validateSignupFields({
      email: 'me@example.com', nickname: '캐시로그', password: 'Cashlog!2026', passwordConfirm: 'Cashlog!2026',
      age14Consent: 'true', termsConsent: 'false', privacyConsent: 'true',
      photoTimeConsent: 'true',
    })).toThrow('이용약관')
  })

  it('requires photo time consent and keeps location optional', () => {
    const base = {
      email: 'me@example.com',
      nickname: '캐시로그',
      password: 'Cashlog!2026',
      passwordConfirm: 'Cashlog!2026',
      age14Consent: 'true',
      termsConsent: 'true',
      privacyConsent: 'true',
    }
    expect(() => validateSignupFields(base)).toThrow('사진과 기록 시간')
    expect(validateSignupFields({
      ...base,
      photoTimeConsent: 'true',
      locationConsent: 'false',
    })).toMatchObject({ photoAndTime: true, location: false })
  })
})
