import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Sparkles } from 'lucide-react'
import type { MoodScore } from '../domain/cashlog'
import {
  getOutfit,
  getPetPalette,
  type PetBreedId,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
} from '../domain/pet'
import { signalSoftImpact } from '../motion/haptics'
import { PetPortrait } from './PetPortrait'
import './InteractivePet3D.css'

type InteractivePet3DProps = {
  kind: PetKind
  name: string
  palette: PetPaletteId
  outfit: OutfitId
  breed: PetBreedId
  compact?: boolean
  className?: string
  cheer?: boolean
  action?: PetAction
  actionRequest?: number
  moodScore?: MoodScore
}

export type PetAction = 'pet' | 'treat' | 'highfive' | 'dance'

const actionMessages = (name: string): Record<PetAction, string> => ({
  pet: `${name}가 눈을 가늘게 뜨고 기대요`,
  treat: `${name}가 간식 냄새에 귀를 쫑긋했어요`,
  highfive: `${name}가 앞발로 인사해요`,
  dance: `${name}가 기분 좋게 살랑거려요`,
})

export function InteractivePet3D({
  kind,
  name,
  palette,
  outfit,
  breed,
  compact = false,
  className = '',
  cheer = false,
  action = 'pet',
  actionRequest = 0,
  moodScore = 3,
}: InteractivePet3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reaction, setReaction] = useState(`${name}가 편안하게 바라보고 있어요`)
  const [activeAction, setActiveAction] = useState<PetAction | null>(null)
  const colors = getPetPalette(palette)
  const currentOutfit = getOutfit(outfit)

  const announce = useCallback((message: string) => {
    setReaction(message)
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(
      () => setReaction(`${name}가 편안하게 바라보고 있어요`),
      1900,
    )
  }, [name])

  const play = useCallback((nextAction: PetAction) => {
    setActiveAction(null)
    if (actionTimer.current) clearTimeout(actionTimer.current)
    requestAnimationFrame(() => setActiveAction(nextAction))
    actionTimer.current = setTimeout(
      () => setActiveAction(null),
      nextAction === 'dance' ? 1450 : 1050,
    )
  }, [])

  const interact = useCallback(() => {
    signalSoftImpact()
    play('pet')
    announce(actionMessages(name).pet)
  }, [announce, name, play])

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    if (actionTimer.current) clearTimeout(actionTimer.current)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(
      () => setReaction(`${name}가 편안하게 바라보고 있어요`),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [name])

  useEffect(() => {
    if (!cheer) return undefined
    const timer = window.setTimeout(() => play('dance'), 0)
    return () => window.clearTimeout(timer)
  }, [cheer, play])

  useEffect(() => {
    if (actionRequest === 0) return undefined
    const timer = window.setTimeout(() => {
      play(action)
      announce(actionMessages(name)[action])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [action, actionRequest, announce, name, play])

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1
    host.style.setProperty('--pet-rotate-y', `${x * 5}deg`)
    host.style.setProperty('--pet-rotate-x', `${y * -2.5}deg`)
    host.style.setProperty('--pet-shift-x', `${x * 5}px`)
  }

  const resetPointer = () => {
    const host = hostRef.current
    if (!host) return
    host.style.setProperty('--pet-rotate-y', '0deg')
    host.style.setProperty('--pet-rotate-x', '0deg')
    host.style.setProperty('--pet-shift-x', '0px')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      interact()
    }
  }

  const style = {
    '--pet-accent': colors.accent,
    '--pet-body': colors.body,
    '--pet-body-alt': colors.bodyAlt,
    '--pet-mood-energy': 0.88 + (moodScore - 1) * 0.03,
  } as CSSProperties

  return (
    <div
      ref={hostRef}
      className={`interactive-pet-3d${compact ? ' is-compact' : ''}${activeAction ? ` is-${activeAction}` : ''} ${className}`.trim()}
      style={style}
      data-breed={breed}
      data-outfit={outfit}
      role="button"
      tabIndex={0}
      aria-label={`${name} 캐릭터. 누르면 다정하게 인사해요.`}
      title={`${name}에게 인사하기`}
      onKeyDown={handleKeyDown}
      onClick={interact}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      onPointerCancel={resetPointer}
    >
      <div className="pet-portrait-stage" aria-hidden="true">
        <PetPortrait
          kind={kind}
          name={name}
          outfit={outfit}
          breed={breed}
          palette={palette}
          className="interactive-pet-portrait"
        />
        <span className="pet-ground-shadow" />
      </div>
      <div className="pet-3d-reaction" aria-live="polite">
        <Sparkles size={15} aria-hidden="true" />
        <span>{reaction}</span>
      </div>
      {outfit !== 'none' && (
        <span className="pet-costume-badge" aria-label={`${currentOutfit.name} 착용 중`}>
          <span aria-hidden>{currentOutfit.icon}</span>
          {currentOutfit.name}
        </span>
      )}
    </div>
  )
}
