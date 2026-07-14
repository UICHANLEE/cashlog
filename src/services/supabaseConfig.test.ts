import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseConfig } from './supabaseConfig'

describe('Supabase configuration', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('accepts the current publishable key environment variable', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co/')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_cashlog')

    expect(getSupabaseConfig()).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'sb_publishable_cashlog',
    })
  })
})
