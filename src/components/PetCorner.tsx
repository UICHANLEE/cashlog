import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeLevel,
  getOutfit,
  isOutfitUnlocked,
  outfits,
  type OutfitId,
  type PetKind,
  type PetState,
} from '../domain/pet'
import { CatDoodle, DogDoodle } from './Doodles'
import './PetCorner.css'

type PetCornerProps = {
  totalRecords: number
  petState: PetState
  onOutfitChange: (kind: PetKind, outfit: OutfitId) => void
}

export function PetCorner({ totalRecords, petState, onOutfitChange }: PetCornerProps) {
  const level = computeLevel(totalRecords)
  const [cheer, setCheer] = useState(false)
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCheer = useCallback(() => {
    if (cheerTimer.current) {
      clearTimeout(cheerTimer.current)
      cheerTimer.current = null
    }
  }, [])

  useEffect(() => clearCheer, [clearCheer])

  const play = useCallback(() => {
    clearCheer()
    setCheer(true)
    cheerTimer.current = setTimeout(() => setCheer(false), 1100)
  }, [clearCheer])

  const atMax = level.remaining === 0
  const pct = Math.round(level.progress * 100)

  const renderWardrobe = (kind: PetKind) => {
    const current = kind === 'cat' ? petState.catOutfit : petState.dogOutfit
    const label = kind === 'cat' ? petState.catName : petState.dogName
    const emoji = kind === 'cat' ? '🐱' : '🐶'
    return (
      <div className="pet-wardrobe-row">
        <span className="pet-wardrobe-label">
          {emoji} {label} 코디
        </span>
        <div className="outfit-chips" role="group" aria-label={`${label} 옷 고르기`}>
          {outfits.map((o) => {
            const unlocked = isOutfitUnlocked(o.id, level.level)
            const active = o.id === current
            return (
              <button
                key={o.id}
                type="button"
                className={`outfit-chip${active ? ' active' : ''}${unlocked ? '' : ' locked'}`}
                aria-pressed={active}
                aria-label={`${label} ${o.name} 옷${unlocked ? '' : ` (Lv.${o.minLevel} 필요)`}`}
                disabled={!unlocked}
                onClick={() => {
                  onOutfitChange(kind, o.id)
                  play()
                }}
              >
                <span aria-hidden>{unlocked ? o.icon : '🔒'}</span>
                {o.name}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="pet-card">
      <div className="section-heading section-heading-toolbar">
        <div>
          <p className="eyebrow">Pet playground</p>
          <h2>
            {petState.catName} · {petState.dogName}와 함께 커가요
          </h2>
        </div>
        <button type="button" className="ghost-button pet-play-btn" onClick={play}>
          🐾 쓰다듬기
        </button>
      </div>

      <div className={`pet-stage${cheer ? ' is-cheering' : ''}`}>
        <button
          type="button"
          className="pet-figure"
          onClick={play}
          aria-label={`${petState.catName} 쓰다듬기`}
        >
          <CatDoodle className="pet-doodle pet-doodle-cat" outfit={petState.catOutfit} />
        </button>
        <span className="pet-bond" aria-hidden>
          {cheer ? '💕' : '🐾'}
        </span>
        <button
          type="button"
          className="pet-figure"
          onClick={play}
          aria-label={`${petState.dogName} 쓰다듬기`}
        >
          <DogDoodle className="pet-doodle pet-doodle-dog" outfit={petState.dogOutfit} />
        </button>
        {cheer && (
          <div className="pet-hearts" aria-hidden>
            <span>❤</span>
            <span>💛</span>
            <span>💙</span>
          </div>
        )}
      </div>

      <div className="pet-level">
        <div className="pet-level-head">
          <strong>
            Lv.{level.level} · {level.title}
          </strong>
          <span>{atMax ? '최고 레벨 달성! 🎉' : `다음 레벨까지 ${level.remaining}개`}</span>
        </div>
        <div
          className="pet-level-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="레벨 진행도"
        >
          <div className="pet-level-fill" style={{ width: `${atMax ? 100 : pct}%` }} />
        </div>
        <small>
          지금까지 기록 {level.totalRecords}개 · 기록을 남길수록 {petState.catName}·
          {petState.dogName}가 함께 성장하고 새 옷이 열려요.
        </small>
      </div>

      <div className="pet-wardrobe">
        {renderWardrobe('cat')}
        {renderWardrobe('dog')}
      </div>

      <p className="pet-next-unlock">
        {(() => {
          const nextLocked = outfits.find((o) => !isOutfitUnlocked(o.id, level.level))
          if (!nextLocked) return '모든 코디를 해금했어요! 마음껏 갈아입혀 주세요. ✨'
          return `🔒 다음 코디 「${getOutfit(nextLocked.id).name}」는 Lv.${nextLocked.minLevel}에 열려요.`
        })()}
      </p>
    </section>
  )
}
