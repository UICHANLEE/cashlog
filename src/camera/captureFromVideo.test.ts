import { describe, expect, it } from 'vitest'
import { captureFrameFromVideo } from './captureFromVideo'

describe('captureFromVideo', () => {
  it('returns null when video dimensions are zero', async () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'videoWidth', { value: 0 })
    Object.defineProperty(video, 'videoHeight', { value: 0 })

    await expect(captureFrameFromVideo(video)).resolves.toBeNull()
  })
})
