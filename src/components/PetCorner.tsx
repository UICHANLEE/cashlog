import { useCallback, useEffect, useRef, useState } from 'react'
import {
  computeLevel,
  catBreeds,
  dogBreeds,
  getOutfit,
  getPetPalette,
  getPetBreed,
  isOutfitUnlocked,
  outfits,
  petPalettes,
  type CatBreedId,
  type DogBreedId,
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
  cloudStatus?: string
  onKindChange: (kind: PetKind) => void
  onBreedChange: {
    (kind: 'cat', breed: CatBreedId): void
    (kind: 'dog', breed: DogBreedId): void
  }
  onOutfitChange: (kind: PetKind, outfit: OutfitId) => void
  onPaletteChange: (kind: PetKind, palette: PetPaletteId) => void
}

export function PetCorner({
  totalRecords,
  petState,
  cloudStatus,
  onKindChange,
  onBreedChange,
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
  const activeKind = petState.selectedKind
  const activeName = activeKind === 'cat' ? petState.catName : petState.dogName
  const activeBreed =
    activeKind === 'cat'
      ? getPetBreed('cat', petState.catBreed)
      : getPetBreed('dog', petState.dogBreed)
  const activeOutfit = activeKind === 'cat' ? petState.catOutfit : petState.dogOutfit
  const activePalette = activeKind === 'cat' ? petState.catPalette : petState.dogPalette

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
          <p className="eyebrow">Pet profile</p>
          <h2>
            {activeName}와 함께 쓰는 가계부
          </h2>
          <small className="pet-sync-caption">
            {cloudStatus ?? '로그인하면 선택한 캐릭터가 다른 기기에도 동기화돼요.'}
          </small>
        </div>
        <button type="button" className="ghost-button pet-play-btn" onClick={play}>
          🐾 쓰다듬기
        </button>
      </div>

      <div className="pet-kind-grid" role="group" aria-label="대표 캐릭터 선택">
        <button
          type="button"
          className={`pet-kind-card${activeKind === 'cat' ? ' active' : ''}`}
          aria-pressed={activeKind === 'cat'}
          onClick={() => {
            onKindChange('cat')
            play()
          }}
        >
          <CatDoodle
            className="pet-kind-preview"
            outfit={petState.catOutfit}
            palette={petState.catPalette}
            breed={petState.catBreed}
          />
          <span>고양이</span>
          <strong>{getPetBreed('cat', petState.catBreed).name}</strong>
        </button>
        <button
          type="button"
          className={`pet-kind-card${activeKind === 'dog' ? ' active' : ''}`}
          aria-pressed={activeKind === 'dog'}
          onClick={() => {
            onKindChange('dog')
            play()
          }}
        >
          <DogDoodle
            className="pet-kind-preview"
            outfit={petState.dogOutfit}
            palette={petState.dogPalette}
            breed={petState.dogBreed}
          />
          <span>강아지</span>
          <strong>{getPetBreed('dog', petState.dogBreed).name}</strong>
        </button>
      </div>

      <div className={`pet-stage${cheer ? ' is-cheering' : ''}`}>
        <button
          type="button"
          className="pet-figure pet-figure-main"
          onClick={play}
          aria-label={`${activeName} 쓰다듬기`}
        >
          {activeKind === 'cat' ? (
            <CatDoodle
              className="pet-doodle pet-doodle-cat"
              outfit={petState.catOutfit}
              palette={petState.catPalette}
              breed={petState.catBreed}
            />
          ) : (
            <DogDoodle
              className="pet-doodle pet-doodle-dog"
              outfit={petState.dogOutfit}
              palette={petState.dogPalette}
              breed={petState.dogBreed}
            />
          )}
        </button>
        <div className="pet-stage-copy">
          <span className="pet-bond" aria-hidden>{cheer ? '💕' : '🐾'}</span>
          <strong>{activeBreed.name}</strong>
          <small>{activeBreed.vibe}</small>
        </div>
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
          지금까지 기록 {level.totalRecords}개 · 기록을 남길수록 {activeName}가 성장하고 새 옷이 열려요.
        </small>
      </div>

      <div className="pet-wardrobe">
        <div className="pet-breed-section">
          <span className="pet-wardrobe-label">
            {activeKind === 'cat' ? '고양이 종류 선택' : '강아지 종류 선택'}
          </span>
          <div className="breed-grid" role="group" aria-label={`${activeName} 종류 선택`}>
            {(activeKind === 'cat' ? catBreeds : dogBreeds).map((breed) => {
              const active =
                activeKind === 'cat' ? petState.catBreed === breed.id : petState.dogBreed === breed.id
              return (
                <button
                  key={breed.id}
                  type="button"
                  className={`breed-card${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    if (activeKind === 'cat') onBreedChange('cat', breed.id as CatBreedId)
                    else onBreedChange('dog', breed.id as DogBreedId)
                    play()
                  }}
                >
                  <strong>{breed.name}</strong>
                  <small>{breed.vibe}</small>
                </button>
              )
            })}
          </div>
        </div>
        {renderWardrobe(activeKind)}
      </div>

      <p className="pet-next-unlock">
        {(() => {
          const nextLocked = outfits.find((o) => !isOutfitUnlocked(o.id, level.level))
          if (!nextLocked) return '모든 코디를 해금했어요! 마음껏 갈아입혀 주세요. ✨'
          return `다음 코디 「${getOutfit(nextLocked.id).name}」는 Lv.${nextLocked.minLevel}에 열려요. 지금 ${activeName}는 ${getPetPalette(activePalette).name} 색칠, ${getOutfit(activeOutfit).name} 코디예요.`
        })()}
      </p>
    </section>
  )
}
