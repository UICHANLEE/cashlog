export type StoryGestureDirection = -1 | 0 | 1

type StoryGestureDecision = {
  offset: number
  velocity: number
  viewportWidth: number
  index: number
  total: number
}

export function rubberbandDistance(
  overshoot: number,
  dimension: number,
  constant = 0.55,
) {
  const safeDimension = Math.max(1, dimension)
  const distance = Math.max(0, overshoot)
  return (distance * safeDimension * constant) / (safeDimension + constant * distance)
}

export function storyDragOffset(
  rawOffset: number,
  index: number,
  viewportWidth: number,
) {
  if (index > 0 || rawOffset <= 0) return rawOffset
  return rubberbandDistance(rawOffset, viewportWidth)
}

export function decideStoryGesture({
  offset,
  velocity,
  viewportWidth,
  index,
  total,
}: StoryGestureDecision): StoryGestureDirection {
  if (total <= 0) return 0

  const threshold = Math.max(56, viewportWidth * 0.18)
  const projectedOffset = offset + velocity * 0.2
  const isFlick = Math.abs(velocity) >= 110

  if (projectedOffset <= -threshold || (isFlick && velocity < 0)) return 1
  if (index > 0 && (projectedOffset >= threshold || (isFlick && velocity > 0))) return -1
  return 0
}
