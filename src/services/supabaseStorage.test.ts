import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCashlogStorage, resolveSupabaseSignedUrl } from './supabaseStorage'

describe('Supabase private media storage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes both Supabase signed URL response formats', () => {
    expect(
      resolveSupabaseSignedUrl('https://cashlog.supabase.co', '/object/sign/cashlog-media/a?token=x'),
    ).toBe('https://cashlog.supabase.co/storage/v1/object/sign/cashlog-media/a?token=x')
    expect(
      resolveSupabaseSignedUrl('https://cashlog.supabase.co', '/storage/v1/object/sign/cashlog-media/a?token=x'),
    ).toBe('https://cashlog.supabase.co/storage/v1/object/sign/cashlog-media/a?token=x')
  })

  it('uploads to the signed-in user folder and returns a signed URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedURL: '/storage/v1/object/sign/cashlog-media/signed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const storage = createCashlogStorage(
      { url: 'https://cashlog.supabase.co', anonKey: 'anon-key' },
      { accessToken: 'access-token', user: { id: 'user-1', email: 'me@example.com' } },
    )
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', {
      type: 'image/jpeg',
    })
    const result = await storage!.uploadImage(image, 'expense-1')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://cashlog.supabase.co/storage/v1/object/cashlog-media/user-1/expense-1/original.jpg',
    )
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token', 'x-upsert': 'true' }),
      body: image,
    })
    expect(result).toEqual({
      path: 'user-1/expense-1/original.jpg',
      signedUrl: 'https://cashlog.supabase.co/storage/v1/object/sign/cashlog-media/signed',
    })
  })
})
