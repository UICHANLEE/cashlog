import { afterEach, describe, expect, it, vi } from 'vitest'
import { exchangeSession, login } from './accountApi'

describe('account API failure messages', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('distinguishes a network failure from a server failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(login('user@example.com', 'password', true)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(login('user@example.com', 'password', true)).rejects.toMatchObject({
      status: 503,
      message: '서버가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.',
    })
  })

  it('exchanges a refresh token through a same-origin credentialed request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      accessToken: 'access-token',
      user: { id: 'user-1' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await exchangeSession('refresh-token')

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ refreshToken: 'refresh-token', remember: true }),
    }))
  })
})
