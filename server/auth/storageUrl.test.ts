import { describe, expect, it } from 'vitest'
import { resolveServerStorageSignedUrl } from './storageUrl'

describe('profile image signed URL', () => {
  it('does not duplicate or omit the Supabase storage API prefix', () => {
    const origin = 'https://cashlog.supabase.co'
    expect(resolveServerStorageSignedUrl(origin, '/object/sign/cashlog-profiles/avatar?token=x')).toBe(
      `${origin}/storage/v1/object/sign/cashlog-profiles/avatar?token=x`,
    )
    expect(resolveServerStorageSignedUrl(origin, '/storage/v1/object/sign/cashlog-profiles/avatar?token=x')).toBe(
      `${origin}/storage/v1/object/sign/cashlog-profiles/avatar?token=x`,
    )
  })
})
