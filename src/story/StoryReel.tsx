import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { X } from 'lucide-react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { formatCurrency } from '../domain/cashlog'
import { signalSoftImpact } from '../motion/haptics'
import {
  decideStoryGesture,
  storyDragOffset,
  type StoryGestureDirection,
} from './storyGesture'
import { looksIncomeLikeSlide, netOutflowContribution } from './storyMoneyFlow'
import './StoryReel.css'

export type StorySlide = {
  id: string
  variant?: 'entry' | 'summary'
  tone?: 'sun' | 'coral' | 'mint' | 'sky'
  eyebrow?: string
  stats?: Array<{ label: string; value: string }>
  /** 없으면 직접 입력(글만) 카드 표시 */
  imageUrl?: string
  /** 있으면 영상으로 재생 (imageUrl은 포스터로 사용) */
  videoUrl?: string
  headline: string
  amountLabel: string
  /** 원 단위 (수입도 양수) */
  amountWon: number
  detail?: string
  /** 있으면 키워드 추정보다 우선 (수입 장면 방향·누적) */
  isIncome?: boolean
}

type StoryReelProps = {
  title: string
  /** 예: 「하루 누적」「월 누적」 */
  aggregateLabel: string
  slides: StorySlide[]
  onClose: () => void
  autoAdvanceMs?: number
}

type MotionBurst = {
  token: number
  direction: 'up' | 'down'
  label: string
}

type PointerSample = {
  x: number
  time: number
}

type ActiveGesture = {
  pointerId: number
  startX: number
  originX: number
  width: number
  samples: PointerSample[]
  moved: boolean
  offset: number
  tapDirection: StoryGestureDirection
}

function slideIsIncome(slide: StorySlide): boolean {
  if (typeof slide.isIncome === 'boolean') return slide.isIncome
  return looksIncomeLikeSlide(slide.headline, slide.detail)
}

function slideIsSummary(slide: StorySlide): boolean {
  return slide.variant === 'summary'
}

/** 순지출 계: 지출 더하고 수입은 줄임 */
function cumulativeNet(slice: StorySlide[]): number {
  let n = 0
  for (const s of slice) {
    if (slideIsSummary(s)) continue
    n += netOutflowContribution(s.headline, s.detail, s.amountWon, s.isIncome)
  }
  return n
}

/** 툴바 누적 표시: 수입 반영 시 +, 지출 반영 시 − (내부는 순지출 스칼라) */
function formatToolbarRunningTotal(netOutflow: number) {
  const cashDelta = -netOutflow
  if (cashDelta === 0) return '0원'
  if (cashDelta > 0) return `+${formatCurrency(cashDelta)}`
  return `‑${formatCurrency(-cashDelta)}`
}

function slideDeltaLabel(slide: StorySlide) {
  const income = slideIsIncome(slide)
  const amt = formatCurrency(slide.amountWon)
  return income ? `+${amt}` : `‑${amt}`
}

function releaseVelocity(samples: PointerSample[]) {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const first = samples.find((sample) => last.time - sample.time <= 120) ?? samples[0]
  const elapsedSeconds = Math.max(0.016, (last.time - first.time) / 1000)
  return (last.x - first.x) / elapsedSeconds
}

/** 인스타 스토리 풀스크린 */
export function StoryReel({
  title,
  aggregateLabel,
  slides,
  onClose,
  autoAdvanceMs = 6500,
}: StoryReelProps) {
  const [index, setIndex] = useState(0)
  const [timerCycle, setTimerCycle] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipTickRef = useRef(true)
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionRef = useRef<ReturnType<typeof animate> | null>(null)
  const navigationTokenRef = useRef(0)
  const gestureRef = useRef<ActiveGesture | null>(null)
  const suppressTapRef = useRef(false)
  const viewportWidthRef = useRef(0)
  const [motionBurst, setMotionBurst] = useState<MotionBurst | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const dragX = useMotionValue(0)
  const slideTransform = useTransform(dragX, (value) => {
    const tilt = Math.max(-2.2, Math.min(2.2, value / -150))
    return `translate3d(${value}px, 0, 0) rotate(${tilt}deg)`
  })
  const slideOpacity = useTransform(dragX, (value) =>
    Math.max(0.74, 1 - Math.abs(value) / 780),
  )

  const clearMotionTimer = useCallback(() => {
    if (motionClearRef.current) {
      clearTimeout(motionClearRef.current)
      motionClearRef.current = null
    }
  }, [])

  const flushMotion = useCallback(() => {
    clearMotionTimer()
    setMotionBurst(null)
  }, [clearMotionTimer])

  const fireMotionForSlide = useCallback(
    (slide: StorySlide) => {
      if (slideIsSummary(slide)) return
      const income = slideIsIncome(slide)
      const direction: 'up' | 'down' = income ? 'up' : 'down'
      const amt = formatCurrency(slide.amountWon)
      const label = income ? `+${amt}` : `‑${amt}`
      flushMotion()
      setMotionBurst({
        token: Date.now(),
        direction,
        label,
      })
      motionClearRef.current = setTimeout(() => flushMotion(), 880)
    },
    [flushMotion],
  )

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopTransition = useCallback(() => {
    navigationTokenRef.current += 1
    transitionRef.current?.stop()
    transitionRef.current = null
  }, [])

  const settleSlide = useCallback(
    (velocity = 0) => {
      stopTransition()
      if (prefersReducedMotion) {
        dragX.set(0)
      } else {
        transitionRef.current = animate(dragX, 0, {
          type: 'spring',
          duration: 0.34,
          bounce: 0.16,
          velocity,
        })
      }
      setTimerCycle((cycle) => cycle + 1)
    },
    [dragX, prefersReducedMotion, stopTransition],
  )

  const navigate = useCallback(
    async (
      direction: Exclude<StoryGestureDirection, 0>,
      velocity = 0,
      options: { animate?: boolean; impact?: boolean } = {},
    ) => {
      clearTimer()
      flushMotion()
      const targetIndex = index + direction

      if (targetIndex < 0) {
        settleSlide(velocity)
        return
      }

      const shouldAnimate = options.animate !== false && !prefersReducedMotion
      if (!shouldAnimate) {
        stopTransition()
        dragX.set(0)
        if (targetIndex >= slides.length) onClose()
        else setIndex(targetIndex)
        if (options.impact) signalSoftImpact()
        return
      }

      stopTransition()
      const token = navigationTokenRef.current
      const width = Math.max(
        320,
        viewportWidthRef.current || window.innerWidth || 320,
      )
      const exitTarget = direction === 1 ? -width * 1.08 : width * 1.08
      const exitAnimation = animate(dragX, exitTarget, {
        type: 'spring',
        duration: 0.32,
        bounce: 0.08,
        velocity,
      })
      transitionRef.current = exitAnimation
      if (options.impact) signalSoftImpact()

      try {
        await exitAnimation.finished
      } catch {
        return
      }
      if (token !== navigationTokenRef.current) return
      if (targetIndex >= slides.length) {
        onClose()
        return
      }

      setIndex(targetIndex)
      dragX.set(direction === 1 ? width : -width)
      requestAnimationFrame(() => {
        if (token !== navigationTokenRef.current) return
        transitionRef.current = animate(dragX, 0, {
          type: 'spring',
          duration: 0.38,
          bounce: 0.12,
        })
      })
    },
    [
      clearTimer,
      dragX,
      flushMotion,
      index,
      onClose,
      prefersReducedMotion,
      settleSlide,
      slides.length,
      stopTransition,
    ],
  )

  const scheduleAdvance = useCallback(() => {
    clearTimer()
    if (autoAdvanceMs <= 0 || slides.length === 0 || isDragging) return
    timerRef.current = setTimeout(() => {
      void navigate(1, 0, { animate: true })
    }, autoAdvanceMs)
  }, [autoAdvanceMs, clearTimer, isDragging, navigate, slides.length])

  useEffect(() => {
    scheduleAdvance()
    return clearTimer
  }, [index, scheduleAdvance, timerCycle, clearTimer])

  useEffect(() => {
    document.body.dataset.storyReelOpen = 'true'
    return () => {
      delete document.body.dataset.storyReelOpen
    }
  }, [])

  useEffect(() => {
    return () => {
      clearMotionTimer()
      transitionRef.current?.stop()
    }
  }, [clearMotionTimer])

  useEffect(() => {
    if (slides.length === 0) return
    const slide = slides[index]
    if (!slide) return
    if (skipTickRef.current) {
      skipTickRef.current = false
      return
    }
    fireMotionForSlide(slide)
  }, [fireMotionForSlide, index, slides])

  const prev = useCallback(
    (animated = true, impact = true) => {
      void navigate(-1, 0, { animate: animated, impact })
    },
    [navigate],
  )

  const next = useCallback(
    (animated = true, impact = true) => {
      void navigate(1, 0, { animate: animated, impact })
    },
    [navigate],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') next(false, false)
      if (event.key === 'ArrowLeft') prev(false, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, onClose, prev])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.story-reel-close')) return

    clearTimer()
    flushMotion()
    stopTransition()
    viewportWidthRef.current = Math.max(320, event.currentTarget.clientWidth)
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originX: dragX.get(),
      width: viewportWidthRef.current,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      moved: false,
      offset: dragX.get(),
      tapDirection: target.closest('.story-tap-prev')
        ? -1
        : target.closest('.story-tap-next')
          ? 1
          : 0,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const rawOffset = gesture.originX + event.clientX - gesture.startX
    gesture.offset = rawOffset
    gesture.moved ||= Math.abs(event.clientX - gesture.startX) > 8
    gesture.samples.push({ x: event.clientX, time: event.timeStamp })
    gesture.samples = gesture.samples
      .filter((sample) => event.timeStamp - sample.time <= 140)
      .slice(-6)
    dragX.set(
      prefersReducedMotion ? 0 : storyDragOffset(rawOffset, index, gesture.width),
    )
  }

  const finishPointerGesture = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gesture.samples.push({ x: event.clientX, time: event.timeStamp })
    const velocity = cancelled ? 0 : releaseVelocity(gesture.samples)
    const direction = cancelled
      ? 0
      : decideStoryGesture({
          offset: prefersReducedMotion ? gesture.offset : dragX.get(),
          velocity,
          viewportWidth: gesture.width,
          index,
          total: slides.length,
        })

    suppressTapRef.current = gesture.moved || gesture.tapDirection !== 0
    if (suppressTapRef.current) {
      window.setTimeout(() => {
        suppressTapRef.current = false
      }, 0)
    }
    gestureRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    if (!gesture.moved && gesture.tapDirection !== 0) {
      void navigate(gesture.tapDirection as -1 | 1, 0, { animate: true, impact: true })
    } else if (direction === 0) {
      settleSlide(velocity)
    } else {
      void navigate(direction, velocity, { animate: true, impact: true })
    }
  }

  const handleTap = (direction: -1 | 1) => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false
      return
    }
    if (direction === -1) prev()
    else next()
  }

  if (slides.length === 0) return null

  const slide = slides[index]
  const sliceNow = slides.slice(0, index + 1)
  const cumulative = cumulativeNet(slideIsSummary(slide) ? slides : sliceNow)
  const currentDelta = slideIsSummary(slide) ? null : slideDeltaLabel(slide)

  return (
    <div
      className={`story-reel-overlay${isDragging ? ' is-dragging' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ '--story-advance-duration': `${autoAdvanceMs}ms` } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointerGesture(event)}
      onPointerCancel={(event) => finishPointerGesture(event, true)}
    >
      <header className="story-reel-chrome">
        <div className="story-progress-row" aria-hidden="true">
          {slides.map((storySlide, progressIndex) => (
            <div key={storySlide.id} className="story-progress-seg">
              <div
                className={`story-progress-fill ${progressIndex === index ? 'active' : ''} ${progressIndex < index ? 'done' : ''}`}
              />
            </div>
          ))}
        </div>
        <div className="story-reel-toolbar">
          <p className="story-reel-title">{title}</p>
          <div className="story-live-total">
            <span className="story-live-label">
              {slideIsSummary(slide) ? '전체' : '누적'} · {aggregateLabel}
            </span>
            <strong className="story-live-sum" aria-live="polite">
              {formatToolbarRunningTotal(cumulative)}
            </strong>
            {currentDelta ? (
              <span
                className={`story-live-now ${slideIsIncome(slide) ? 'is-income' : 'is-spend'}`}
              >
                {currentDelta}
              </span>
            ) : (
              <span className="story-live-now is-summary">
                {index + 1} / {slides.length}
              </span>
            )}
          </div>
          <button
            type="button"
            className="story-reel-close"
            onClick={onClose}
            aria-label="스토리 닫기"
            title="닫기"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {motionBurst && (
        <div
          key={motionBurst.token}
          className={`story-money-burst ${motionBurst.direction === 'up' ? 'burst-up' : 'burst-down'}`}
          aria-hidden="true"
        >
          <span>{motionBurst.label}</span>
        </div>
      )}

      <motion.figure
        className={`story-reel-slide${slideIsSummary(slide) ? ' story-reel-summary-slide' : ''}`}
        style={{ transform: slideTransform, opacity: slideOpacity }}
      >
        {slideIsSummary(slide) ? (
          <div className={`story-summary-pane tone-${slide.tone ?? 'sun'}`}>
            <span className="story-summary-eyebrow">{slide.eyebrow ?? 'CASHLOG STORY'}</span>
            <span className="story-summary-mark" aria-hidden>
              {slide.tone === 'mint' ? '⌁' : slide.tone === 'coral' ? '✹' : '✦'}
            </span>
            <h2>{slide.headline}</h2>
            {slide.detail ? <p>{slide.detail}</p> : null}
            {slide.stats?.length ? (
              <div className="story-summary-stats">
                {slide.stats.map((stat) => (
                  <div key={`${stat.label}-${stat.value}`}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            <small>{slide.amountLabel}</small>
          </div>
        ) : slide.videoUrl ? (
          <video
            className="story-reel-photo"
            src={slide.videoUrl}
            poster={slide.imageUrl}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : slide.imageUrl ? (
          <img src={slide.imageUrl} alt="" className="story-reel-photo" draggable={false} />
        ) : (
          <div
            className={`story-reel-text-pane ${slideIsIncome(slide) ? 'is-income' : 'is-expense'}`}
          >
            <span className="story-reel-text-icon" aria-hidden>
              {slideIsIncome(slide) ? '📗' : '📝'}
            </span>
            <span className="story-reel-text-head">직접 기록</span>
            <span className="story-reel-text-sub">사진 없이 입력한 장부입니다</span>
          </div>
        )}
        {!slideIsSummary(slide) && (
          <figcaption className="story-reel-caption">
            <strong className="story-reel-headline">{slide.headline}</strong>
            <span className="story-reel-amount">{slide.amountLabel}</span>
            {slide.detail ? <small className="story-reel-detail">{slide.detail}</small> : null}
          </figcaption>
        )}
      </motion.figure>

      <button
        type="button"
        className="story-tap story-tap-prev"
        aria-label="이전 장"
        tabIndex={-1}
        onClick={() => handleTap(-1)}
      />
      <button
        type="button"
        className="story-tap story-tap-next"
        aria-label="다음 장"
        tabIndex={-1}
        onClick={() => handleTap(1)}
      />
    </div>
  )
}
