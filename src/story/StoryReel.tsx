import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { formatCurrency } from '../domain/cashlog'
import { looksIncomeLikeSlide, netOutflowContribution } from './storyMoneyFlow'
import './StoryReel.css'

export type StorySlide = {
  id: string
  /** 없으면 직접 입력(글만) 카드 표시 */
  imageUrl?: string
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

function slideIsIncome(slide: StorySlide): boolean {
  if (typeof slide.isIncome === 'boolean') return slide.isIncome
  return looksIncomeLikeSlide(slide.headline, slide.detail)
}

/** 순지출 계: 지출 더하고 수입은 줄임 */
function cumulativeNet(slice: StorySlide[]): number {
  let n = 0
  for (const s of slice) {
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

/** 인스타 스토리 풀스크린 */
export function StoryReel({
  title,
  aggregateLabel,
  slides,
  onClose,
  autoAdvanceMs = 6500,
}: StoryReelProps) {
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipTickRef = useRef(true)
  const motionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [motionBurst, setMotionBurst] = useState<MotionBurst | null>(null)

  const clearMotionTimer = () => {
    if (motionClearRef.current) {
      clearTimeout(motionClearRef.current)
      motionClearRef.current = null
    }
  }

  const flushMotion = useCallback(() => {
    clearMotionTimer()
    setMotionBurst(null)
  }, [])

  const fireMotionForSlide = useCallback(
    (slide: StorySlide) => {
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

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const scheduleAdvance = useCallback(() => {
    clearTimer()
    if (autoAdvanceMs <= 0 || slides.length === 0) return
    timerRef.current = setTimeout(() => {
      setIndex((i) => {
        if (i >= slides.length - 1) {
          onClose()
          return i
        }
        return i + 1
      })
    }, autoAdvanceMs)
  }, [autoAdvanceMs, onClose, slides.length])

  useEffect(() => {
    scheduleAdvance()
    return clearTimer
  }, [index, scheduleAdvance])

  useEffect(() => {
    document.body.dataset.storyReelOpen = 'true'
    return () => {
      delete document.body.dataset.storyReelOpen
    }
  }, [])

  useEffect(() => {
    return () => {
      clearMotionTimer()
    }
  }, [])

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

  const prev = useCallback(() => {
    clearTimer()
    flushMotion()
    setIndex((i) => (i <= 0 ? slides.length - 1 : i - 1))
  }, [flushMotion, slides.length])

  const next = useCallback(() => {
    clearTimer()
    flushMotion()
    setIndex((i) => {
      if (i >= slides.length - 1) {
        onClose()
        return i
      }
      return i + 1
    })
  }, [flushMotion, onClose, slides.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, onClose, prev])

  const touchStartX = useRef<number | null>(null)

  if (slides.length === 0) {
    return null
  }

  const slide = slides[index]
  const sliceNow = slides.slice(0, index + 1)
  const cumulative = cumulativeNet(sliceNow)
  const currentDelta = slideDeltaLabel(slide)

  return (
    <div
      className="story-reel-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ '--story-advance-duration': `${autoAdvanceMs}ms` } as CSSProperties}
    >
      <header className="story-reel-chrome">
        <div className="story-progress-row" aria-hidden="true">
          {slides.map((s, i) => (
            <div key={s.id} className="story-progress-seg">
              <div
                className={`story-progress-fill ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}`}
              />
            </div>
          ))}
        </div>
        <div className="story-reel-toolbar">
          <p className="story-reel-title">{title}</p>
          <div className="story-live-total">
            <span className="story-live-label">누적 · {aggregateLabel}</span>
            <strong className="story-live-sum" aria-live="polite">
              {formatToolbarRunningTotal(cumulative)}
            </strong>
            <span
              className={`story-live-now ${slideIsIncome(slide) ? 'is-income' : 'is-spend'}`}
            >
              {currentDelta}
            </span>
          </div>
          <button type="button" className="story-reel-close" onClick={onClose}>
            ✕ 닫기
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

      <figure
        className="story-reel-slide"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return
          const endX = e.changedTouches[0]?.clientX
          if (endX === undefined) return
          const d = endX - touchStartX.current
          touchStartX.current = null
          if (d > 60) prev()
          else if (d < -60) next()
        }}
      >
        {slide.imageUrl ? (
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
        <figcaption className="story-reel-caption">
          <strong className="story-reel-headline">{slide.headline}</strong>
          <span className="story-reel-amount">{slide.amountLabel}</span>
          {slide.detail ? <small className="story-reel-detail">{slide.detail}</small> : null}
        </figcaption>
      </figure>

      <button type="button" className="story-tap story-tap-prev" aria-label="이전 장" onClick={prev} />
      <button
        type="button"
        className="story-tap story-tap-next"
        aria-label="다음 장"
        onClick={next}
      />

      <p className="story-reel-hint">
        우측 상단 숫자는 지금까지의 증감이에요 (+들어옴, ‑나감). 슬라이드 전환 시 금액 모션이 뜹니다.
      </p>
    </div>
  )
}
