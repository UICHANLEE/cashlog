import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authRefresh: vi.fn(),
  enforceRateLimit: vi.fn(),
  ensureProfile: vi.fn(),
  getAuthUser: vi.fn(),
  toProfileResponse: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  authRefresh: mocks.authRefresh,
  enforceRateLimit: mocks.enforceRateLimit,
  ensureProfile: mocks.ensureProfile,
  getAuthUser: mocks.getAuthUser,
}))

vi.mock('./profileResponse.js', () => ({
  toProfileResponse: mocks.toProfileResponse,
}))

import handler from '../../api/auth/session.js'

const responseMock = () => {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  }
  response.status.mockReturnValue(response)
  response.json.mockReturnValue(response)
  response.end.mockReturnValue(response)
  return response
}

describe('secure auth session exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authRefresh.mockResolvedValue({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
      user: { id: 'user-1', email: 'me@example.com' },
    })
    mocks.ensureProfile.mockResolvedValue({ user_id: 'user-1' })
    mocks.toProfileResponse.mockResolvedValue({ id: 'user-1', email: 'me@example.com' })
  })

  it('rotates the callback token and returns no refresh token to JavaScript', async () => {
    const response = responseMock()
    await handler({
      method: 'POST',
      headers: {},
      body: { refreshToken: 'callback-refresh', remember: true },
      socket: {},
    } as never, response as never)

    expect(mocks.authRefresh).toHaveBeenCalledWith('callback-refresh')
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.arrayContaining([
      expect.stringContaining('cashlog_refresh=rotated-refresh'),
      expect.stringContaining('HttpOnly'),
    ]))
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith(expect.not.objectContaining({
      refreshToken: expect.anything(),
    }))
  })

  it('rejects a missing refresh token before contacting Supabase', async () => {
    const response = responseMock()
    await handler({ method: 'POST', headers: {}, body: {}, socket: {} } as never, response as never)

    expect(mocks.authRefresh).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'INVALID_SESSION',
    }))
  })
})
