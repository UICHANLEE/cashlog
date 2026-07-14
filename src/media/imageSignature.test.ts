import { describe, expect, it } from 'vitest'
import { assertValidImageBytes, detectImageMime } from './imageSignature'

describe('image signature validation', () => {
  it('recognizes supported image magic bytes', () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectImageMime(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).toBe('image/webp')
  })

  it('rejects a disguised executable and mismatched extension', () => {
    expect(() => assertValidImageBytes(new TextEncoder().encode('MZ executable'), 'image/jpeg', 'photo.jpg')).toThrow(/파일 내용/)
    expect(() => assertValidImageBytes(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg', 'photo.png')).toThrow(/확장자/)
  })
})
