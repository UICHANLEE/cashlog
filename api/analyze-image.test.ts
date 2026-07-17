import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { optimizeAnalyzerInput } from './analyze-image'


describe('optimizeAnalyzerInput', () => {
  it('re-encodes a large PNG for the remote analyzer', async () => {
    const width = 1254
    const height = 1254
    const pixels = Buffer.alloc(width * height * 3)
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 31 + Math.floor(index / width)) % 256
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer()

    const optimized = await optimizeAnalyzerInput({
      imageBase64: source.toString('base64'),
      mimeType: 'image/png',
      filename: 'receipt.png',
    })
    const output = Buffer.from(optimized.imageBase64, 'base64')
    const metadata = await sharp(output).metadata()

    expect(optimized.mimeType).toBe('image/jpeg')
    expect(optimized.filename).toBe('receipt.jpg')
    expect(output.length).toBeLessThan(source.length)
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(960)
  })

  it('keeps an already compact JPEG unchanged', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer()
    const input = {
      imageBase64: source.toString('base64'),
      mimeType: 'image/jpeg',
      filename: 'small.jpg',
    }

    await expect(optimizeAnalyzerInput(input)).resolves.toBe(input)
  })
})
