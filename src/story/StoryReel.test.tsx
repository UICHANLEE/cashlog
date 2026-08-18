import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StoryReel, type StorySlide } from './StoryReel'

const slide = (overrides: Partial<StorySlide> = {}): StorySlide => ({
  id: 'slide-1',
  headline: '오늘의 기록',
  amountLabel: '5,200원',
  amountWon: 5_200,
  ...overrides,
})

describe('StoryReel media readiness', () => {
  it('reports an image only after the first visual asset is loaded', () => {
    const onMediaReady = vi.fn()
    const { container } = render(
      <StoryReel
        title="하루 스토리"
        aggregateLabel="하루 누적"
        slides={[slide({ imageUrl: 'https://example.com/photo.jpg' })]}
        onClose={vi.fn()}
        onMediaReady={onMediaReady}
        autoAdvanceMs={0}
      />,
    )

    expect(onMediaReady).not.toHaveBeenCalled()
    const image = container.querySelector('img.story-reel-photo')
    expect(image).not.toBeNull()
    fireEvent.load(image as HTMLImageElement)
    fireEvent.load(image as HTMLImageElement)
    expect(onMediaReady).toHaveBeenCalledOnce()
    expect(onMediaReady).toHaveBeenCalledWith('image')
  })

  it('reports a text-only first slide after it can be painted', async () => {
    const onMediaReady = vi.fn()
    render(
      <StoryReel
        title="한 달 스토리"
        aggregateLabel="월 누적"
        slides={[slide()]}
        onClose={vi.fn()}
        onMediaReady={onMediaReady}
        autoAdvanceMs={0}
      />,
    )

    await waitFor(() => expect(onMediaReady).toHaveBeenCalledWith('none'))
  })
})
