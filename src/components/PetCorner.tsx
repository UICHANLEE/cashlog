import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Cat,
  Cookie,
  Dog,
  Hand,
  Lock,
  Music2,
  Palette,
  PawPrint,
  PiggyBank,
  Shirt,
  Sparkles,
} from 'lucide-react'
import { getMoodOption, type MoodScore } from '../domain/cashlog'
import {
  computeLevel,
  catBreeds,
  dogBreeds,
  getPetBreedId,
  getPetName,
  getOutfit,
  getPetOutfitId,
  getPetPalette,
  getPetPaletteId,
  getPetBreed,
  isOutfitUnlocked,
  outfits,
  petPalettes,
  pigBreeds,
  type CatBreedId,
  type DogBreedId,
  type OutfitCollection,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
  type PetState,
  type PigBreedId,
} from '../domain/pet'
import { getZodiacCharacter } from '../domain/zodiac'
import { signalSoftImpact } from '../motion/haptics'
import type { PetAction } from './InteractivePet3D'
import { PetPortrait } from './PetPortrait'
import './PetCorner.css'

const InteractivePet3D = lazy(() =>
  import('./InteractivePet3D').then((module) => ({ default: module.InteractivePet3D })),
)

type PetCornerProps = {
  totalRecords: number
  petState: PetState
  recentMoodScore?: MoodScore
  cloudStatus?: string
  onKindChange: (kind: PetKind) => void
  onBreedChange: {
    (kind: 'cat', breed: CatBreedId): void
    (kind: 'dog', breed: DogBreedId): void
    (kind: 'pig', breed: PigBreedId): void
  }
  onOutfitChange: (kind: PetKind, outfit: OutfitId) => void
  onPaletteChange: (kind: PetKind, palette: PetPaletteId) => void
}

type WardrobeTab = 'outfits' | 'colors' | 'breeds'

const outfitCollections: Array<{ id: OutfitCollection; label: string }> = [
  { id: 'daily', label: '데일리' },
  { id: 'accent', label: '포인트' },
  { id: 'season', label: '시즌' },
]

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
  const [outfitCollection, setOutfitCollection] = useState<OutfitCollection>(() => {
    const current = getPetOutfitId(petState)
    return getOutfit(current).collection
  })
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

  useEffect(() => {
    if (petState.selectedKind !== 'pig' || wardrobeTab !== 'outfits') return undefined
    const timer = window.setTimeout(() => setWardrobeTab('colors'), 0)
    return () => window.clearTimeout(timer)
  }, [petState.selectedKind, wardrobeTab])

  const selectWardrobeTab = useCallback((nextTab: WardrobeTab) => {
    if (nextTab === wardrobeTab) return
    setWardrobeTab(nextTab)
    signalSoftImpact()
  }, [wardrobeTab])

  const atMax = level.remaining === 0
  const pct = Math.round(level.progress * 100)
  const activeKind = petState.selectedKind
  const activeName = getPetName(petState)
  const activeBreed = getPetBreed(activeKind, getPetBreedId(petState))
  const activeOutfit = getPetOutfitId(petState)
  const activePalette = getPetPaletteId(petState)
  const currentYear = new Date().getFullYear()
  const zodiacCharacter = getZodiacCharacter(currentYear)

  const renderOutfits = (kind: PetKind) => {
    const current = getPetOutfitId(petState, kind)
    const label = getPetName(petState, kind)
    const visibleOutfits = outfits.filter(
      (outfit) => outfit.collection === outfitCollection,
    )
    return (
      <div className="pet-wardrobe-row" aria-labelledby="pet-outfit-label">
        <span id="pet-outfit-label" className="pet-wardrobe-label">{label}에게 입혀 볼 옷</span>
        <div className="outfit-collection-tabs" role="tablist" aria-label="옷 컬렉션">
          {outfitCollections.map((collection) => {
            const active = collection.id === outfitCollection
            return (
              <button
                key={collection.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (active) return
                  setOutfitCollection(collection.id)
                  signalSoftImpact()
                }}
              >
                {collection.label}
              </button>
            )
          })}
        </div>
        <div className="outfit-chips" role="group" aria-label={`${label} 옷 고르기`}>
          {visibleOutfits.map((o) => {
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
                <span className="outfit-chip-preview" aria-hidden>
                  <PetPortrait
                    kind={kind}
                    name={label}
                    outfit={o.id}
                    breed={getPetBreedId(petState, kind)}
                    palette={getPetPaletteId(petState, kind)}
                  />
                  {!unlocked && (
                    <span className="outfit-chip-lock">
                      <Lock size={17} />
                    </span>
                  )}
                  {active && <span className="outfit-chip-wearing">착용 중</span>}
                </span>
                <span className="outfit-chip-copy">
                  <strong>{o.name}</strong>
                  <small>{active ? '지금 모습' : unlocked ? '입혀 보기' : `Lv.${o.minLevel} 해금`}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderColors = (kind: PetKind) => {
    const current = getPetPaletteId(petState, kind)
    const label = getPetName(petState, kind)
    return (
      <div className="pet-wardrobe-row" aria-labelledby="pet-color-label">
        <span id="pet-color-label" className="pet-wardrobe-label">{label}의 무드 컬러</span>
        <div className="palette-chips" role="group" aria-label={`${label} 무드 컬러 고르기`}>
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
                <PetPortrait
                  kind={kind}
                  name={label}
                  outfit={getPetOutfitId(petState, kind)}
                  breed={getPetBreedId(petState, kind)}
                  palette={palette.id}
                  className="palette-pet-preview"
                />
                <strong>{palette.name}</strong>
                <small>{active ? '사용 중' : '미리 보기'}</small>
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
        {activeName}의 종류
      </span>
      <div className="breed-grid" role="group" aria-label={`${activeName} 종류 선택`}>
        {(activeKind === 'cat' ? catBreeds : activeKind === 'dog' ? dogBreeds : pigBreeds).map((breed) => {
          const active = getPetBreedId(petState, activeKind) === breed.id
          return (
            <button
              key={breed.id}
              type="button"
              className={`breed-card${active ? ' active' : ''}`}
              aria-pressed={active}
              onClick={() => {
                onOutfitChange(activeKind, 'none')
                if (activeKind === 'cat') onBreedChange('cat', breed.id as CatBreedId)
                else if (activeKind === 'dog') onBreedChange('dog', breed.id as DogBreedId)
                else onBreedChange('pig', breed.id as PigBreedId)
                play('dance')
              }}
            >
              <PetPortrait
                kind={activeKind}
                name={activeName}
                breed={breed.id}
                palette={activePalette}
                className="breed-card-preview"
              />
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

      <aside className="zodiac-friend" aria-label={`${currentYear}년 올해의 캐릭터`}>
        <div className="zodiac-friend-portrait" aria-hidden="true">
          {zodiacCharacter.assetPath ? (
            <img src={zodiacCharacter.assetPath} alt="" draggable={false} />
          ) : (
            <span>{zodiacCharacter.emoji}</span>
          )}
        </div>
        <div>
          <p className="eyebrow">{currentYear} 올해의 친구</p>
          <strong>{zodiacCharacter.characterName}</strong>
          <span>{zodiacCharacter.animalName} · {zodiacCharacter.message}</span>
        </div>
      </aside>

      <div className="pet-kind-grid" role="group" aria-label="대표 캐릭터 선택">
        <button
          type="button"
          className={`pet-kind-card${activeKind === 'cat' ? ' active' : ''}`}
          aria-pressed={activeKind === 'cat'}
          onClick={() => {
            onKindChange('cat')
            setOutfitCollection(getOutfit(petState.catOutfit).collection)
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
          <PetPortrait
            kind="cat"
            name={petState.catName}
            outfit={petState.catOutfit}
            breed={petState.catBreed}
            palette={petState.catPalette}
            className="pet-kind-preview"
          />
          <span><Cat size={15} aria-hidden="true" /> 고양이</span>
          <strong>{getPetBreed('cat', petState.catBreed).name}</strong>
        </button>
        <button
          type="button"
          className={`pet-kind-card${activeKind === 'dog' ? ' active' : ''}`}
          aria-pressed={activeKind === 'dog'}
          onClick={() => {
            onKindChange('dog')
            setOutfitCollection(getOutfit(petState.dogOutfit).collection)
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
          <PetPortrait
            kind="dog"
            name={petState.dogName}
            outfit={petState.dogOutfit}
            breed={petState.dogBreed}
            palette={petState.dogPalette}
            className="pet-kind-preview"
          />
          <span><Dog size={15} aria-hidden="true" /> 강아지</span>
          <strong>{getPetBreed('dog', petState.dogBreed).name}</strong>
        </button>
        <button
          type="button"
          className={`pet-kind-card${activeKind === 'pig' ? ' active' : ''}`}
          aria-pressed={activeKind === 'pig'}
          onClick={() => {
            onKindChange('pig')
            setWardrobeTab('colors')
            setOutfitCollection(getOutfit(petState.pigOutfit).collection)
            play('dance')
          }}
        >
          {activeKind === 'pig' && (
            <motion.span
              className="pet-kind-selection"
              layoutId="pet-kind-selection"
              transition={{ type: 'spring', duration: 0.34, bounce: 0.08 }}
              aria-hidden="true"
            />
          )}
          <PetPortrait
            kind="pig"
            name={petState.pigName}
            outfit={petState.pigOutfit}
            breed={petState.pigBreed}
            palette={petState.pigPalette}
            className="pet-kind-preview"
          />
          <span><PiggyBank size={15} aria-hidden="true" /> 돼지</span>
          <strong>{getPetBreed('pig', petState.pigBreed).name}</strong>
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
            <Suspense
              fallback={(
                <PetPortrait
                  kind={activeKind}
                  name={activeName}
                  outfit={activeOutfit}
                  breed={getPetBreedId(petState)}
                  palette={activePalette}
                  className="pet-character-loading"
                />
              )}
            >
              <InteractivePet3D
                kind={activeKind}
                name={activeName}
                palette={activePalette}
                outfit={activeOutfit}
                breed={getPetBreedId(petState)}
                action={petAction}
                actionRequest={cheerRequest}
                moodScore={recentMoodScore}
              />
            </Suspense>
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
          지금까지 기록 {level.totalRecords}개 · 기록을 남길수록 {activeName}가 성장하고 새로운 모습이 열려요.
        </small>
      </div>

      <div className="pet-wardrobe">
        <div className={`pet-wardrobe-tabs${activeKind === 'pig' ? ' is-compact' : ''}`} role="tablist" aria-label={`${activeName} 꾸미기 메뉴`}>
          {activeKind !== 'pig' && (
            <button id="pet-tab-outfits" type="button" role="tab" aria-controls="pet-wardrobe-panel" aria-selected={wardrobeTab === 'outfits'} onClick={() => selectWardrobeTab('outfits')}>
              {wardrobeTab === 'outfits' && <motion.span className="wardrobe-tab-selection" layoutId="wardrobe-tab-selection" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} aria-hidden="true" />}
              <Shirt size={17} aria-hidden /> 옷장
            </button>
          )}
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
        {activeKind === 'pig' ? (
          `지금 ${activeName}는 ${getPetPalette(activePalette).name} 색칠의 ${activeBreed.name} 친구예요.`
        ) : (() => {
          const nextLocked = outfits.find((o) => !isOutfitUnlocked(o.id, level.level))
          if (!nextLocked) return '모든 코디를 해금했어요! 마음껏 갈아입혀 주세요.'
          return `다음 코디 「${getOutfit(nextLocked.id).name}」는 Lv.${nextLocked.minLevel}에 열려요. 지금 ${activeName}는 ${getPetPalette(activePalette).name} 색칠, ${getOutfit(activeOutfit).name} 코디예요.`
        })()}
      </p>
    </section>
  )
}
