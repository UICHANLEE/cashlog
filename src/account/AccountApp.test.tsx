import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountApp } from './AccountApp'

const unauthorized = () => Promise.resolve(new Response(JSON.stringify({
  code: 'UNAUTHORIZED',
  message: '로그인이 필요해요.',
}), { status: 401, headers: { 'Content-Type': 'application/json' } }))

describe('AccountApp release paths', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(unauthorized))
  })

  afterEach(() => {
    history.replaceState(null, '', '/')
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('blocks malformed login locally and exposes password recovery', async () => {
    history.replaceState(null, '', '/login.html')
    const user = userEvent.setup()
    render(<AccountApp />)
    await user.type(screen.getByLabelText('이메일'), 'not-an-email')
    await user.type(screen.getByLabelText('비밀번호'), 'password')
    const callsBeforeSubmit = vi.mocked(fetch).mock.calls.length
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByText('올바른 이메일 주소를 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveFocus()
    expect(vi.mocked(fetch).mock.calls).toHaveLength(callsBeforeSubmit)
    expect(screen.getByRole('link', { name: '비밀번호 재설정' })).toHaveAttribute('href', '/forgot-password.html')
  })

  it('marks every missing signup requirement and focuses the first one', async () => {
    history.replaceState(null, '', '/signup.html')
    const user = userEvent.setup()
    render(<AccountApp />)
    await user.click(screen.getByRole('button', { name: '가입하고 기록 시작' }))

    expect(await screen.findByText('닉네임은 2~30자로 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('닉네임')).toHaveFocus()
    expect(screen.getByText('이용약관 동의가 필요해요.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps social signup visible and makes only required consent one tap', async () => {
    history.replaceState(null, '', '/signup.html')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const user = userEvent.setup()
    render(<AccountApp />)

    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카카오로 계속하기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms.html')

    await user.click(screen.getByRole('checkbox', { name: /필수 항목 모두 동의/ }))
    expect(screen.getByRole('checkbox', { name: /만 14세 이상/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /개인정보 처리방침/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /기기의 현재 위치/ })).not.toBeChecked()

    expect(screen.getByLabelText('닉네임')).toHaveAttribute('name', 'nickname')
    expect(screen.getByLabelText('이메일')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('프로필 이미지 파일')).toHaveAttribute('name', 'profileImage')
  })

  it('shows a safe failure state when a reset link has no token', () => {
    history.replaceState(null, '', '/reset-password.html')
    render(<AccountApp />)
    expect(screen.getByRole('alert')).toHaveTextContent('링크가 만료됐거나 올바르지 않아요.')
    expect(screen.getByRole('link', { name: '재설정 링크 다시 받기' })).toBeInTheDocument()
  })

  it('blocks duplicate login submits while the network is slow', async () => {
    history.replaceState(null, '', '/login.html')
    const user = userEvent.setup()
    render(<AccountApp />)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2))
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'Cashlog!2026')
    const callsBeforeSubmit = vi.mocked(fetch).mock.calls.length

    await user.click(screen.getByRole('button', { name: '로그인' }))
    await user.click(screen.getByRole('button', { name: /로그인 중/ }))

    expect(vi.mocked(fetch).mock.calls).toHaveLength(callsBeforeSubmit + 1)
    expect(screen.getByRole('button', { name: /로그인 중/ })).toBeDisabled()
  })

  it('keeps profile users on a retry state during an API outage', async () => {
    history.replaceState(null, '', '/profile.html')
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }))
    render(<AccountApp />)

    expect(await screen.findByRole('heading', { name: '프로필을 불러오지 못했어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(location.pathname).toBe('/profile.html')
  })

  it('removes a recovery token from the address bar after reading it', async () => {
    history.replaceState(null, '', '/reset-password.html#access_token=recovery-secret')
    render(<AccountApp />)
    expect(screen.getByLabelText('새 비밀번호')).toBeInTheDocument()
    await waitFor(() => expect(location.hash).toBe(''))
  })
})
