import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { ApiError } from './http.js'
import type { UploadedFile } from './multipart.js'

const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const detectMime = (buffer: Buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export const prepareProfileImage = async (file: UploadedFile) => {
  const declared = file.mimeType.toLowerCase()
  const detected = detectMime(file.buffer)
  if (!allowedMimes.has(declared) || detected !== declared) {
    throw new ApiError(400, 'INVALID_IMAGE_TYPE', 'JPG, PNG, WebP 이미지만 사용할 수 있어요.', 'profileImage')
  }
  try {
    const image = sharp(file.buffer, { failOn: 'warning', limitInputPixels: 16_000_000 }).rotate()
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height || metadata.width > 4000 || metadata.height > 4000) {
      throw new ApiError(400, 'IMAGE_DIMENSIONS_EXCEEDED', '이미지 크기는 가로·세로 4000px 이하여야 해요.', 'profileImage')
    }
    const buffer = await image.resize(512, 512, { fit: 'cover', position: 'centre' }).webp({ quality: 84 }).toBuffer()
    return { buffer, filename: `${randomUUID()}.webp`, mimeType: 'image/webp' }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'INVALID_IMAGE', '손상되었거나 읽을 수 없는 이미지예요.', 'profileImage')
  }
}
