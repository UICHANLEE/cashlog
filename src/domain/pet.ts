/** 펫 성장·코디 도메인 — 기록 개수로 함께 레벨업 */

export type PetKind = 'cat' | 'dog' | 'pig'

export type CatBreedId =
  | 'korean_short'
  | 'cheese_tabby'
  | 'tuxedo'
  | 'calico'
  | 'siamese'
  | 'russian_blue'
  | 'persian'
  | 'black_cat'

export type DogBreedId =
  | 'maltese'
  | 'toy_poodle'
  | 'shiba'
  | 'retriever'
  | 'dachshund'
  | 'pomeranian'
  | 'border_collie'
  | 'corgi'

export type PigBreedId = 'pink_pig' | 'mini_pig' | 'spotted_pig' | 'black_pig'

export type PetBreedId = CatBreedId | DogBreedId | PigBreedId

export type PetBreed = {
  id: PetBreedId
  kind: PetKind
  name: string
  vibe: string
}

export const catBreeds: PetBreed[] = [
  { id: 'korean_short', kind: 'cat', name: '코숏', vibe: '깔끔한 기본 친구' },
  { id: 'cheese_tabby', kind: 'cat', name: '치즈태비', vibe: '밝고 장난스러운 무드' },
  { id: 'tuxedo', kind: 'cat', name: '턱시도', vibe: '블랙&화이트 시크함' },
  { id: 'calico', kind: 'cat', name: '삼색이', vibe: '알록달록 행운 느낌' },
  { id: 'siamese', kind: 'cat', name: '샴', vibe: '포인트 컬러가 또렷함' },
  { id: 'russian_blue', kind: 'cat', name: '러시안블루', vibe: '차분한 쿨톤' },
  { id: 'persian', kind: 'cat', name: '페르시안', vibe: '복슬복슬 고급짐' },
  { id: 'black_cat', kind: 'cat', name: '까망이', vibe: '밤하늘 같은 존재감' },
]

export const dogBreeds: PetBreed[] = [
  { id: 'maltese', kind: 'dog', name: '말티즈', vibe: '작고 뽀얀 기본템' },
  { id: 'toy_poodle', kind: 'dog', name: '토이푸들', vibe: '동글동글 곱슬 매력' },
  { id: 'shiba', kind: 'dog', name: '시바견', vibe: '당당하고 귀여운 표정' },
  { id: 'retriever', kind: 'dog', name: '리트리버', vibe: '든든한 햇살 친구' },
  { id: 'dachshund', kind: 'dog', name: '닥스훈트', vibe: '짧은 다리 긴 매력' },
  { id: 'pomeranian', kind: 'dog', name: '포메라니안', vibe: '복슬복슬 아이돌상' },
  { id: 'border_collie', kind: 'dog', name: '보더콜리', vibe: '똑똑한 흑백 포인트' },
  { id: 'corgi', kind: 'dog', name: '웰시코기', vibe: '발랄한 짧은 다리' },
]

export const pigBreeds: PetBreed[] = [
  { id: 'pink_pig', kind: 'pig', name: '핑크피그', vibe: '복숭아빛 말랑 친구' },
  { id: 'mini_pig', kind: 'pig', name: '미니피그', vibe: '작고 야무진 호기심쟁이' },
  { id: 'spotted_pig', kind: 'pig', name: '점박이', vibe: '한눈에 기억되는 포인트' },
  { id: 'black_pig', kind: 'pig', name: '까망돼지', vibe: '윤기 나는 행운 친구' },
]

export const petBreeds = [...catBreeds, ...dogBreeds, ...pigBreeds]

export function getPetBreed(kind: 'cat', id: CatBreedId): PetBreed
export function getPetBreed(kind: 'dog', id: DogBreedId): PetBreed
export function getPetBreed(kind: 'pig', id: PigBreedId): PetBreed
export function getPetBreed(kind: PetKind, id: PetBreedId): PetBreed
export function getPetBreed(kind: PetKind, id: PetBreedId): PetBreed {
  const list = kind === 'cat' ? catBreeds : kind === 'dog' ? dogBreeds : pigBreeds
  return list.find((breed) => breed.id === id) ?? list[0]
}

export type OutfitId =
  | 'none'
  | 'bow'
  | 'flower'
  | 'hoodie'
  | 'sailor'
  | 'party'
  | 'beret'
  | 'glasses'
  | 'mini_bag'
  | 'scarf'
  | 'crown'
  | 'raincoat'
  | 'pajamas'

export type OutfitCollection = 'daily' | 'accent' | 'season'

export type Outfit = {
  id: OutfitId
  name: string
  icon: string
  collection: OutfitCollection
  /** 해금에 필요한 최소 레벨 */
  minLevel: number
}

export type PetPaletteId = 'cream' | 'strawberry' | 'mint' | 'space'

export type PetPalette = {
  id: PetPaletteId
  name: string
  body: string
  bodyAlt: string
  blush: string
  accent: string
  shadow: string
}

export const petPalettes: PetPalette[] = [
  {
    id: 'cream',
    name: '크림',
    body: '#ffd8a8',
    bodyAlt: '#fff0d8',
    blush: '#ff9ec4',
    accent: '#ff7a59',
    shadow: '#d29a61',
  },
  {
    id: 'strawberry',
    name: '딸기우유',
    body: '#ffc4d9',
    bodyAlt: '#fff1f6',
    blush: '#ff6f9f',
    accent: '#ef476f',
    shadow: '#d87a9e',
  },
  {
    id: 'mint',
    name: '민트',
    body: '#b9f3df',
    bodyAlt: '#ecfff8',
    blush: '#ff9ec4',
    accent: '#2fbf9b',
    shadow: '#63bda1',
  },
  {
    id: 'space',
    name: '밤하늘',
    body: '#8ea7ff',
    bodyAlt: '#eef2ff',
    blush: '#ffc2e0',
    accent: '#ffd23f',
    shadow: '#5569bf',
  },
]

export function getPetPalette(id: PetPaletteId): PetPalette {
  return petPalettes.find((p) => p.id === id) ?? petPalettes[0]
}

/** 코디 목록 — 레벨이 오를수록 해금 */
export const outfits: Outfit[] = [
  { id: 'none', name: '포근한 기본', icon: '🐾', collection: 'daily', minLevel: 1 },
  { id: 'bow', name: '피치 리본', icon: '🎀', collection: 'daily', minLevel: 1 },
  { id: 'flower', name: '봄꽃 핀', icon: '🌸', collection: 'daily', minLevel: 1 },
  { id: 'hoodie', name: '말랑 후디', icon: '🧥', collection: 'daily', minLevel: 1 },
  { id: 'sailor', name: '세일러 룩', icon: '👕', collection: 'daily', minLevel: 2 },
  { id: 'party', name: '생일 꼬깔', icon: '🎉', collection: 'accent', minLevel: 2 },
  { id: 'beret', name: '피치 베레모', icon: '🧢', collection: 'accent', minLevel: 2 },
  { id: 'glasses', name: '동글 안경', icon: '👓', collection: 'accent', minLevel: 3 },
  { id: 'mini_bag', name: '미니 크로스백', icon: '👜', collection: 'accent', minLevel: 3 },
  { id: 'crown', name: '꼬마 왕관', icon: '👑', collection: 'accent', minLevel: 5 },
  { id: 'scarf', name: '포근 목도리', icon: '🧣', collection: 'season', minLevel: 2 },
  { id: 'raincoat', name: '민트 우비', icon: '🌧️', collection: 'season', minLevel: 3 },
  { id: 'pajamas', name: '별밤 파자마', icon: '🌙', collection: 'season', minLevel: 4 },
]

export function getOutfit(id: OutfitId): Outfit {
  return outfits.find((o) => o.id === id) ?? outfits[0]
}

export function isOutfitUnlocked(id: OutfitId, level: number): boolean {
  return level >= getOutfit(id).minLevel
}

export type PetState = {
  selectedKind: PetKind
  catName: string
  dogName: string
  pigName: string
  catBreed: CatBreedId
  dogBreed: DogBreedId
  pigBreed: PigBreedId
  catOutfit: OutfitId
  dogOutfit: OutfitId
  pigOutfit: OutfitId
  catPalette: PetPaletteId
  dogPalette: PetPaletteId
  pigPalette: PetPaletteId
}

export const defaultPetState: PetState = {
  selectedKind: 'cat',
  catName: '나비',
  dogName: '초코',
  pigName: '몽이',
  catBreed: 'korean_short',
  dogBreed: 'maltese',
  pigBreed: 'pink_pig',
  catOutfit: 'none',
  dogOutfit: 'none',
  pigOutfit: 'none',
  catPalette: 'cream',
  dogPalette: 'cream',
  pigPalette: 'strawberry',
}

export function getPetName(state: PetState, kind: PetKind = state.selectedKind): string {
  if (kind === 'cat') return state.catName
  if (kind === 'dog') return state.dogName
  return state.pigName
}

export function getPetBreedId(state: PetState, kind: PetKind = state.selectedKind): PetBreedId {
  if (kind === 'cat') return state.catBreed
  if (kind === 'dog') return state.dogBreed
  return state.pigBreed
}

export function getPetOutfitId(state: PetState, kind: PetKind = state.selectedKind): OutfitId {
  if (kind === 'cat') return state.catOutfit
  if (kind === 'dog') return state.dogOutfit
  return state.pigOutfit
}

export function getPetPaletteId(
  state: PetState,
  kind: PetKind = state.selectedKind,
): PetPaletteId {
  if (kind === 'cat') return state.catPalette
  if (kind === 'dog') return state.dogPalette
  return state.pigPalette
}

/** 저장된 값 보정 (알 수 없는 outfit → none) */
export function normalizePetState(raw: Partial<PetState> | null | undefined): PetState {
  const validOutfit = (v: unknown): OutfitId =>
    outfits.some((o) => o.id === v) ? (v as OutfitId) : 'none'
  const validPalette = (v: unknown): PetPaletteId =>
    petPalettes.some((p) => p.id === v) ? (v as PetPaletteId) : 'cream'
  const validKind = (v: unknown): PetKind =>
    v === 'dog' || v === 'cat' || v === 'pig' ? v : 'cat'
  const validCatBreed = (v: unknown): CatBreedId =>
    catBreeds.some((breed) => breed.id === v) ? (v as CatBreedId) : 'korean_short'
  const validDogBreed = (v: unknown): DogBreedId =>
    dogBreeds.some((breed) => breed.id === v) ? (v as DogBreedId) : 'maltese'
  const validPigBreed = (v: unknown): PigBreedId =>
    pigBreeds.some((breed) => breed.id === v) ? (v as PigBreedId) : 'pink_pig'
  return {
    selectedKind: validKind(raw?.selectedKind),
    catName: (raw?.catName ?? '').toString().trim() || defaultPetState.catName,
    dogName: (raw?.dogName ?? '').toString().trim() || defaultPetState.dogName,
    pigName: (raw?.pigName ?? '').toString().trim() || defaultPetState.pigName,
    catBreed: validCatBreed(raw?.catBreed),
    dogBreed: validDogBreed(raw?.dogBreed),
    pigBreed: validPigBreed(raw?.pigBreed),
    catOutfit: validOutfit(raw?.catOutfit),
    dogOutfit: validOutfit(raw?.dogOutfit),
    pigOutfit: validOutfit(raw?.pigOutfit),
    catPalette: validPalette(raw?.catPalette),
    dogPalette: validPalette(raw?.dogPalette),
    pigPalette: validPalette(raw?.pigPalette ?? defaultPetState.pigPalette),
  }
}

const LEVEL_TITLES = [
  '첫 발자국',
  '기록 새싹',
  '성실한 기록가',
  '가계부 마스터',
  '절약 요정',
  '머니 구루',
]

/** 각 레벨에 도달하기 위한 누적 기록 수 (구간이 넘어가면 +20씩) */
const BASE_THRESHOLDS = [0, 3, 8, 15, 25, 40]
const STEP_AFTER_BASE = 20

export function recordsToReachLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= BASE_THRESHOLDS.length) return BASE_THRESHOLDS[level - 1]
  const last = BASE_THRESHOLDS[BASE_THRESHOLDS.length - 1]
  return last + (level - BASE_THRESHOLDS.length) * STEP_AFTER_BASE
}

export type LevelInfo = {
  level: number
  title: string
  totalRecords: number
  recordsIntoLevel: number
  recordsForNext: number
  /** 다음 레벨까지 남은 기록 수 */
  remaining: number
  /** 0..1 진행도 */
  progress: number
}

export function computeLevel(totalRecords: number): LevelInfo {
  const total = Math.max(0, Math.floor(totalRecords))
  let level = 1
  while (recordsToReachLevel(level + 1) <= total) level += 1

  const start = recordsToReachLevel(level)
  const next = recordsToReachLevel(level + 1)
  const recordsForNext = next - start
  const recordsIntoLevel = total - start
  const remaining = Math.max(0, next - total)
  const progress = recordsForNext > 0 ? recordsIntoLevel / recordsForNext : 1

  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    totalRecords: total,
    recordsIntoLevel,
    recordsForNext,
    remaining,
    progress: Math.min(1, Math.max(0, progress)),
  }
}
