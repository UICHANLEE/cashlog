import type { CashlogSession } from './auth'
import type { SupabaseConfig } from './supabaseConfig'
import { assertValidImageFile } from '../media/imageSignature'

const BUCKET = 'cashlog-media'

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

const extensionFor = (mimeType: string) => {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/heic') return 'heic'
  if (mimeType === 'image/heif') return 'heif'
  return 'jpg'
}

const storageHeaders = (config: SupabaseConfig, session: CashlogSession) => ({
  apikey: config.anonKey,
  Authorization: `Bearer ${session.accessToken}`,
})

export type StoredImage = { path: string; signedUrl: string }

export const resolveSupabaseSignedUrl = (baseUrl: string, signedUrl: string) => {
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl
  const path = signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`
  if (path.startsWith('/storage/v1/')) return `${baseUrl}${path}`
  return `${baseUrl}/storage/v1${path}`
}

export const createCashlogStorage = (
  config: SupabaseConfig | null,
  session: CashlogSession | null,
) => {
  const userId = session?.user?.id
  if (!config || !session || !userId) return null

  const createSignedUrl = async (path: string, expiresIn = 60 * 60): Promise<string> => {
    const response = await fetch(
      `${config.url}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: { ...storageHeaders(config, session), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      },
    )
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { signedURL?: string; signedUrl?: string }
    const signed = body.signedURL ?? body.signedUrl
    if (!signed) throw new Error('사진 접근 주소를 만들지 못했어요.')
    return resolveSupabaseSignedUrl(config.url, signed)
  }

  const uploadImage = async (file: File, expenseId: string): Promise<StoredImage> => {
    await assertValidImageFile(file)
    if (file.type !== 'image/jpeg') {
      throw new Error('보관용 사진은 안전하게 변환된 JPEG만 지원해요.')
    }
    const path = `${userId}/${expenseId}/original.${extensionFor(file.type)}`
    const response = await fetch(
      `${config.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: {
          ...storageHeaders(config, session),
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: file,
      },
    )
    if (!response.ok) throw new Error(await response.text())
    return { path, signedUrl: await createSignedUrl(path) }
  }

  return { bucket: BUCKET, uploadImage, createSignedUrl }
}
