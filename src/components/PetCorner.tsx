import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cat,
  Crown,
  Dog,
  Glasses,
  Hand,
  Lock,
  Palette,
  PartyPopper,
  PawPrint,
  Shirt,
  Sparkles,
  Wind,
} from 'lucide-react'
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
import { signalSoftImpact } from '../motion/haptics'
import { InteractivePet3D, PetPortrait } from './InteractivePet3D'
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

type WardrobeTab = 'outfits' | 'colors' | 'breeds'

const outfitIcon = (id: OutfitId) => {
  if (id === 'hoodie' || id === 'sailor') return <Shirt size={19} />
  if (id === 'party') return <PartyPopper size={19} />
  if (id === 'glasses') return <Glasses size={19} />
  if (id === 'scarf') return <Wind size={19} />
  if (id === 'crown') return <Crown size={19} />
  if (id === 'bow') return <Sparkles size={19} />
  return <PawPrint size={19} />
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
  const [cheerRequest, setCheerRequest] = useState(0)
  const [wardrobeTab, setWardrobeTab] = useState<WardrobeTab>('outfits')
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCheer = useCallback(() => {
    if (cheerTimer.current) {
      clearTimeout(cheerTimer.current)
      cheerTimer.current = null
    }
  }, [])

  const play = useCallback(() => {
    signalSoftImpact()
    setCheer(true)
    setCheerRequest((request) => request + 1)
  }, [])

  useEffect(() => {
    if (cheerRequest === 0) return undefined
    clearCheer()
    cheerTimer.current = setTimeout(() => setCheer(false), 1100)
    return clearCheer
  }, [cheerRequest, clearCheer])

  useEffect(() => clearCheer, [clearCheer])

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

  const renderOutfits = (kind: PetKind) => {
    const current = kind === 'cat' ? petState.catOutfit : petState.dogOutfit
    const label = kind === 'cat' ? petState.catName : petState.dogName
    return (
      <div className="pet-wardrobe-row" aria-labelledby="pet-outfit-label">
        <span id="pet-outfit-label" className="pet-wardrobe-label">{label}에게 입혀 볼 옷</span>
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
                <span className="outfit-chip-icon" aria-hidden>{unlocked ? outfitIcon(o.id) : <Lock size={18} />}</span>
                <strong>{o.name}</strong>
                <small>{active ? '입는 중' : unlocked ? '입혀 보기' : `Lv.${o.minLevel}`}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderColors = (kind: PetKind) => {
    const current = kind === 'cat' ? petState.catPalette : petState.dogPalette
    const label = kind === 'cat' ? petState.catName : petState.dogName
    return (
      <div className="pet-wardrobe-row" aria-labelledby="pet-color-label">
        <span id="pet-color-label" className="pet-wardrobe-label">{label}의 컬러</span>
        <div className="palette-chips" role="group" aria-label={`${label} 털색 고르기`}>
          {petPalettes.map((palette) => {
            const active = palette.id === current
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
                <strong>{palette.name}</strong>
                <small>{active ? '사용 중' : '색칠하기'}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderBreeds = () => (
    <div className="pet-breed-section">
      <span className="pet-wardrobe-label">
        {activeKind === 'cat' ? '나비의 고양이 종류' : '초코의 강아지 종류'}
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
  )

  return (
    <section className="pet-card">
      <div className="section-heading section-heading-toolbar">
        <div>
          <p className="eyebrow">Pet profile</p>
          <h2>
            {activeName}와 함께 쓰는 가계부
          </h2>
          {cloudStatus && <small className="pet-sync-caption">{cloudStatus}</small>}
        </div>
        <button type="button" className="ghost-button pet-play-btn" onClick={play}>
          <Hand size={17} aria-hidden="true" /> 쓰다듬기
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
          <PetPortrait kind="cat" name={petState.catName} className="pet-kind-preview" />
          <span><Cat size={15} aria-hidden="true" /> 고양이</span>
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
          <PetPortrait kind="dog" name={petState.dogName} className="pet-kind-preview" />
          <span><Dog size={15} aria-hidden="true" /> 강아지</span>
          <strong>{getPetBreed('dog', petState.dogBreed).name}</strong>
        </button>
      </div>

      <div className={`pet-stage pet-stage-3d${cheer ? ' is-cheering' : ''}`}>
        <InteractivePet3D
          kind={activeKind}
          name={activeName}
          palette={activePalette}
          outfit={activeOutfit}
          breed={activeKind === 'cat' ? petState.catBreed : petState.dogBreed}
          cheer={cheer}
        />
        <div className="pet-stage-copy">
          <span className="pet-bond" aria-hidden><Sparkles size={22} /></span>
          <strong>{activeBreed.name}</strong>
          <small>{activeBreed.vibe}</small>
          <div className="pet-look-summary" aria-label={`${activeName} 현재 스타일`}>
            <span
              className="pet-look-swatch"
              style={{ background: getPetPalette(activePalette).body }}
              aria-hidden
            />
            <span>{getPetPalette(activePalette).name}</span>
            <span aria-hidden>·</span>
            <span>{getOutfit(activeOutfit).name}</span>
          </div>
        </div>
        {cheer && (
          <div className="pet-hearts" aria-hidden>
            <span>♡</span>
            <span>♥</span>
            <span>♡</span>
          </div>
        )}
      </div>

      <div className="pet-level">
        <div className="pet-level-head">
          <strong>
            Lv.{level.level} · {level.title}
          </strong>
          <span>{atMax ? '최고 레벨 달성!' : `다음 레벨까지 ${level.remaining}개`}</span>
        </div>
        <div
          className="pet-level-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="레벨 진행도"
        >
          <div
            className="pet-level-fill"
            style={{ transform: `scaleX(${atMax ? 1 : level.progress})` }}
          />
        </div>
        <small>
          지금까지 기록 {level.totalRecords}개 · 기록을 남길수록 {activeName}가 성장하고 새 옷이 열려요.
        </small>
      </div>

      <div className="pet-wardrobe">
        <div className="pet-wardrobe-tabs" role="tablist" aria-label="나비 꾸미기 메뉴">
          <button type="button" role="tab" aria-selected={wardrobeTab === 'outfits'} onClick={() => setWardrobeTab('outfits')}>
            <Shirt size={17} aria-hidden /> 옷장
          </button>
          <button type="button" role="tab" aria-selected={wardrobeTab === 'colors'} onClick={() => setWardrobeTab('colors')}>
            <Palette size={17} aria-hidden /> 컬러
          </button>
          <button type="button" role="tab" aria-selected={wardrobeTab === 'breeds'} onClick={() => setWardrobeTab('breeds')}>
            <PawPrint size={17} aria-hidden /> 종류
          </button>
        </div>
        <div className="pet-wardrobe-panel" role="tabpanel">
          {wardrobeTab === 'outfits' && renderOutfits(activeKind)}
          {wardrobeTab === 'colors' && renderColors(activeKind)}
          {wardrobeTab === 'breeds' && renderBreeds()}
        </div>
      </div>

      <p className="pet-next-unlock">
        {(() => {
          const nextLocked = outfits.find((o) => !isOutfitUnlocked(o.id, level.level))
          if (!nextLocked) return '모든 코디를 해금했어요! 마음껏 갈아입혀 주세요.'
          return `다음 코디 「${getOutfit(nextLocked.id).name}」는 Lv.${nextLocked.minLevel}에 열려요. 지금 ${activeName}는 ${getPetPalette(activePalette).name} 색칠, ${getOutfit(activeOutfit).name} 코디예요.`
        })()}
      </p>
    </section>
  )
}
