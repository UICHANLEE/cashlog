import { getSupabaseConfig } from './supabaseConfig'

export type ReservationResult = 'created' | 'duplicate'

type SupabaseError = {
  code?: string
  message?: string
  details?: string
}

const readSupabaseError = async (response: Response): Promise<SupabaseError> => {
  try {
    return (await response.json()) as SupabaseError
  } catch {
    return {}
  }
}

export const createReservation = async (email: string): Promise<ReservationResult> => {
  const config = getSupabaseConfig()
  if (!config) throw new Error('예약 서비스를 준비하고 있어요. 잠시 후 다시 시도해 주세요.')

  const response = await fetch(`${config.url}/rest/v1/cashlog_reservations`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      marketing_consent: true,
      consent_version: '2026-07-14',
      consented_at: new Date().toISOString(),
      source: 'reservation',
    }),
  })

  if (!response.ok) {
    const error = await readSupabaseError(response)
    if (response.status === 409 && error.code === '23505') return 'duplicate'
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new Error('예약 저장 공간을 찾지 못했어요. 관리자에게 알려주세요.')
    }
    if (response.status === 401 || response.status === 403 || error.code === '42501') {
      throw new Error('예약 저장 권한을 확인하고 있어요. 잠시 후 다시 시도해 주세요.')
    }
    throw new Error('예약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  return 'created'
}
