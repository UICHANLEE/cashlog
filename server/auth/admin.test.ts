import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  requireAuthUser: mocks.requireAuthUser,
}))

import { getAdminEmails, requireAdminUser } from './admin.js'

describe('admin authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CASHLOG_ADMIN_EMAILS', ' Owner@Example.com, team@example.com ')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('normalizes the configured email allowlist', () => {
    expect([...getAdminEmails()]).toEqual(['owner@example.com', 'team@example.com'])
  })

  it('allows only an authenticated user in the allowlist', async () => {
    const authenticated = { user: { id: 'user-1', email: 'OWNER@example.com' }, accessToken: 'token' }
    mocks.requireAuthUser.mockResolvedValue(authenticated)

    await expect(requireAdminUser({} as never)).resolves.toBe(authenticated)
  })

  it('rejects an authenticated non-admin account', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      user: { id: 'user-2', email: 'visitor@example.com' },
      accessToken: 'token',
    })

    await expect(requireAdminUser({} as never)).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_FORBIDDEN',
    })
  })

  it('fails closed when no administrator is configured', async () => {
    vi.stubEnv('CASHLOG_ADMIN_EMAILS', '')

    await expect(requireAdminUser({} as never)).rejects.toMatchObject({
      status: 503,
      code: 'ADMIN_NOT_CONFIGURED',
    })
    expect(mocks.requireAuthUser).not.toHaveBeenCalled()
  })
})
