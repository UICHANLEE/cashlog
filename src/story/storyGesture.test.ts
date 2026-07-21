import { describe, expect, it } from 'vitest'
import {
  decideStoryGesture,
  rubberbandDistance,
  storyDragOffset,
} from './storyGesture'

describe('story gesture physics', () => {
  it('keeps a normal drag attached to the pointer', () => {
    expect(storyDragOffset(-84, 1, 390)).toBe(-84)
    expect(storyDragOffset(84, 1, 390)).toBe(84)
  })

  it('adds rising resistance before the first story', () => {
    const resisted = storyDragOffset(180, 0, 390)
    expect(resisted).toBeGreaterThan(0)
    expect(resisted).toBeLessThan(180)
    expect(rubberbandDistance(360, 390)).toBeLessThan(360)
  })

  it('uses release velocity for a short flick', () => {
    expect(
      decideStoryGesture({
        offset: -18,
        velocity: -420,
        viewportWidth: 390,
        index: 0,
        total: 4,
      }),
    ).toBe(1)
  })

  it('snaps a slow short drag back and blocks previous at the first story', () => {
    expect(
      decideStoryGesture({
        offset: -24,
        velocity: -30,
        viewportWidth: 390,
        index: 1,
        total: 4,
      }),
    ).toBe(0)
    expect(
      decideStoryGesture({
        offset: 120,
        velocity: 500,
        viewportWidth: 390,
        index: 0,
        total: 4,
      }),
    ).toBe(0)
  })
})
