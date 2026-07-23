import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Cat,
  Briefcase,
  Crown,
  Cookie,
  Dog,
  Glasses,
  Flower2,
  Hand,
  Lock,
  Music2,
  Palette,
  PartyPopper,
  PawPrint,
  Shirt,
  Sparkles,
  Wind,
} from 'lucide-react'
import { getMoodOption, type MoodScore } from '../domain/cashlog'
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
import { InteractivePet3D, PetPortrait, type PetAction } from './InteractivePet3D'
import './PetCorner.css'

type PetCornerProps = {
  totalRecords: number
  petState: PetState
  recentMoodScore?: MoodScore
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
  if (id === 'flower') return <Flower2 size={19} />
  if (id === 'beret') return <Crown size={19} />
  if (id === 'mini_bag') return <Briefcase size={19} />
  if (id === 'bow') return <Sparkles size={19} />
  return <PawPrint size={19} />
}

const actionOptions: Array<{
  id: PetAction
  label: string
  icon: typeof Hand
}> = [
  { id: 'pet', label: '쓰다듬기', icon: Hand },
  { id: 'treat', label: '간식', icon: Cookie },
  { id: 'highfive', label: '하이파이브', icon: Sparkles },
  { id: 'dance', label: '댄스', icon: Music2 },
]

export function PetCorner({
  totalRecords,
  petState,
  recentMoodScore,
  cloudStatus,
  onKindChange,
  onBreedChange,
  onOutfitChange,
  onPaletteChange,
}: PetCornerProps) {
  const prefersReducedMotion = useReducedMotion()
  const level = computeLevel(totalRecords)
  const [cheer, setCheer] = useState(false)
  const [cheerRequest, setCheerRequest] = useState(0)
  const [petAction, setPetAction] = useState<PetAction>('pet')
  const [wardrobeTab, setWardrobeTab] = useState<WardrobeTab>('outfits')
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCheer = useCallback(() => {
    if (cheerTimer.current) {
      clearTimeout(cheerTimer.current)
      cheerTimer.current = null
    }
  }, [])

  const play = useCallback((action: PetAction = 'pet') => {
    signalSoftImpact()
    setPetAction(action)
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

  const selectWardrobeTab = useCallback((nextTab: WardrobeTab) => {
    if (nextTab === wardrobeTab) return
    setWardrobeTab(nextTab)
    signalSoftImpact()
  }, [wardrobeTab])

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
                  play('dance')
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
                  play('dance')
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
                play('dance')
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
        <button type="button" className="ghost-button pet-play-btn" onClick={() => play('pet')}>
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
            play('dance')
          }}
        >
          {activeKind === 'cat' && (
            <motion.span
              className="pet-kind-selection"
              layoutId="pet-kind-selection"
              transition={{ type: 'spring', duration: 0.34, bounce: 0.08 }}
              aria-hidden="true"
            />
          )}
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
            play('dance')
          }}
        >
          {activeKind === 'dog' && (
            <motion.span
              className="pet-kind-selection"
              layoutId="pet-kind-selection"
              transition={{ type: 'spring', duration: 0.34, bounce: 0.08 }}
              aria-hidden="true"
            />
          )}
          <PetPortrait kind="dog" name={petState.dogName} className="pet-kind-preview" />
          <span><Dog size={15} aria-hidden="true" /> 강아지</span>
          <strong>{getPetBreed('dog', petState.dogBreed).name}</strong>
        </button>
      </div>

      <div className={`pet-stage pet-stage-3d${cheer ? ' is-cheering' : ''}`}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={`${activeKind}-${activeBreed.id}-${activePalette}-${activeOutfit}`}
            className="pet-character-stage"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.14 }
                : { type: 'spring', duration: 0.38, bounce: 0.08 }
            }
          >
            <InteractivePet3D
              kind={activeKind}
              name={activeName}
              palette={activePalette}
              outfit={activeOutfit}
              breed={activeKind === 'cat' ? petState.catBreed : petState.dogBreed}
              action={petAction}
              actionRequest={cheerRequest}
              moodScore={recentMoodScore}
            />
          </motion.div>
        </AnimatePresence>
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
          {recentMoodScore && (
            <span className="pet-recent-mood">
              <span aria-hidden>{getMoodOption(recentMoodScore).face}</span>
              최근 기분 {recentMoodScore}/5
            </span>
          )}
        </div>
        <AnimatePresence>
          {cheer && (
            <motion.div
              key={`${petAction}-${cheerRequest}`}
              className={`pet-action-burst is-${petAction}`}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -20 }}
              transition={{ type: 'spring', duration: 0.36, bounce: 0.12 }}
              aria-hidden
            >
              {petAction === 'treat' && <Cookie size={24} />}
              {petAction === 'highfive' && <Sparkles size={24} />}
              {petAction === 'dance' && <Music2 size={24} />}
              {petAction === 'pet' && <Hand size={24} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pet-action-row" role="group" aria-label={`${activeName}와 놀기`}>
        {actionOptions.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cheer && petAction === id ? 'active' : ''}
            aria-pressed={cheer && petAction === id}
            onClick={() => play(id)}
          >
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
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
          <button id="pet-tab-outfits" type="button" role="tab" aria-controls="pet-wardrobe-panel" aria-selected={wardrobeTab === 'outfits'} onClick={() => selectWardrobeTab('outfits')}>
            {wardrobeTab === 'outfits' && <motion.span className="wardrobe-tab-selection" layoutId="wardrobe-tab-selection" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} aria-hidden="true" />}
            <Shirt size={17} aria-hidden /> 옷장
          </button>
          <button id="pet-tab-colors" type="button" role="tab" aria-controls="pet-wardrobe-panel" aria-selected={wardrobeTab === 'colors'} onClick={() => selectWardrobeTab('colors')}>
            {wardrobeTab === 'colors' && <motion.span className="wardrobe-tab-selection" layoutId="wardrobe-tab-selection" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} aria-hidden="true" />}
            <Palette size={17} aria-hidden /> 컬러
          </button>
          <button id="pet-tab-breeds" type="button" role="tab" aria-controls="pet-wardrobe-panel" aria-selected={wardrobeTab === 'breeds'} onClick={() => selectWardrobeTab('breeds')}>
            {wardrobeTab === 'breeds' && <motion.span className="wardrobe-tab-selection" layoutId="wardrobe-tab-selection" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} aria-hidden="true" />}
            <PawPrint size={17} aria-hidden /> 종류
          </button>
        </div>
        <div id="pet-wardrobe-panel" className="pet-wardrobe-panel" role="tabpanel" aria-labelledby={`pet-tab-${wardrobeTab}`}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={wardrobeTab}
              className="pet-wardrobe-panel-content"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.12 }
                  : { type: 'spring', duration: 0.28, bounce: 0 }
              }
            >
              {wardrobeTab === 'outfits' && renderOutfits(activeKind)}
              {wardrobeTab === 'colors' && renderColors(activeKind)}
              {wardrobeTab === 'breeds' && renderBreeds()}
            </motion.div>
          </AnimatePresence>
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
