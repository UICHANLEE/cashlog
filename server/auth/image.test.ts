import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { prepareProfileImage } from './image'

describe('profile image processing', () => {
  it('re-encodes an accepted image to a square WebP without metadata', async () => {
    const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#f45b50' } }).jpeg().toBuffer()
    const result = await prepareProfileImage({ buffer: input, filename: 'avatar.jpg', mimeType: 'image/jpeg' })
    const metadata = await sharp(result.buffer).metadata()
    expect(result.mimeType).toBe('image/webp')
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
    expect(result.filename).toMatch(/\.webp$/)
  })

  it('rejects declared image types that do not match the bytes', async () => {
    const input = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer()
    await expect(prepareProfileImage({ buffer: input, filename: 'fake.jpg', mimeType: 'image/jpeg' })).rejects.toThrow('JPG, PNG, WebP')
  })
})
