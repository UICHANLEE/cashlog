import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeLevel,
  getOutfit,
  getPetPalette,
  isOutfitUnlocked,
  outfits,
  petPalettes,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
  type PetState,
} from '../domain/pet'
import { CatDoodle, DogDoodle } from './Doodles'
import './PetCorner.css'

type PetCornerProps = {
  totalRecords: number
  petState: PetState
  onOutfitChange: (kind: PetKind, outfit: OutfitId) => void
  onPaletteChange: (kind: PetKind, palette: PetPaletteId) => void
}

export function PetCorner({
  totalRecords,
  petState,
  onOutfitChange,
  onPaletteChange,
}: PetCornerProps) {
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
    const currentPalette = kind === 'cat' ? petState.catPalette : petState.dogPalette
    const label = kind === 'cat' ? petState.catName : petState.dogName
    return (
      <div className="pet-wardrobe-row">
        <span className="pet-wardrobe-label">{label} 꾸미기</span>
        <div className="palette-chips" role="group" aria-label={`${label} 털색 고르기`}>
          {petPalettes.map((palette) => {
            const active = palette.id === currentPalette
            return (
              <button
                key={palette.id}
                type="button"
                className={`palette-chip${active ? ' active' : ''}`}
                aria-pressed={active}
                aria-label={`${label} ${palette.name} 색칠`}
                onClick={() => {
                  onPaletteChange(kind, palette.id)
                  play()
                }}
              >
                <span
                  aria-hidden
                  style={{
                    background: `linear-gradient(135deg, ${palette.body}, ${palette.bodyAlt})`,
                    boxShadow: `inset 0 -6px 10px ${palette.shadow}55`,
                  }}
                />
                {palette.name}
              </button>
            )
          })}
        </div>
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
            {petState.catName} · {petState.dogName} 색칠 놀이터
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
          <CatDoodle
            className="pet-doodle pet-doodle-cat"
            outfit={petState.catOutfit}
            palette={petState.catPalette}
          />
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
          <DogDoodle
            className="pet-doodle pet-doodle-dog"
            outfit={petState.dogOutfit}
            palette={petState.dogPalette}
          />
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
          return `다음 코디 「${getOutfit(nextLocked.id).name}」는 Lv.${nextLocked.minLevel}에 열려요. 지금 색칠은 ${getPetPalette(petState.catPalette).name}·${getPetPalette(petState.dogPalette).name} 무드예요.`
        })()}
      </p>
    </section>
  )
}
