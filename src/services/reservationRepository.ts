import { getSupabaseConfig } from './supabaseConfig'

export type ReservationResult = 'created' | 'duplicate'

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

  if (response.status === 409) return 'duplicate'
  if (!response.ok) throw new Error('예약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  return 'created'
}
