import { describe, expect, it } from 'vitest'
import { validateLogin, validateNicknameInput } from './validation'

describe('account client validation', () => {
  it('rejects malformed login fields before sending a request', () => {
    expect(validateLogin('not-an-email', '')).toEqual({
      email: '올바른 이메일 주소를 입력해 주세요.',
      password: '비밀번호를 입력해 주세요.',
    })
    expect(validateLogin('USER@example.com', 'password')).toEqual({})
  })

  it('keeps nickname rules aligned with the API', () => {
    expect(validateNicknameInput(' 현명한 소비자 ')).toBe('')
    expect(validateNicknameInput('<script>')).toContain('2~30자')
    expect(validateNicknameInput('a')).toContain('2~30자')
  })
})
