/** 펫(고양이·강아지) 성장·코디 도메인 — 기록 개수로 함께 레벨업 */

export type PetKind = 'cat' | 'dog'

export type OutfitId =
  | 'none'
  | 'bow'
  | 'party'
  | 'glasses'
  | 'scarf'
  | 'crown'

export type Outfit = {
  id: OutfitId
  name: string
  icon: string
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
  { id: 'none', name: '기본', icon: '🐾', minLevel: 1 },
  { id: 'bow', name: '리본', icon: '🎀', minLevel: 1 },
  { id: 'party', name: '파티모자', icon: '🎉', minLevel: 2 },
  { id: 'glasses', name: '선글라스', icon: '🕶️', minLevel: 3 },
  { id: 'scarf', name: '목도리', icon: '🧣', minLevel: 4 },
  { id: 'crown', name: '왕관', icon: '👑', minLevel: 5 },
]

export function getOutfit(id: OutfitId): Outfit {
  return outfits.find((o) => o.id === id) ?? outfits[0]
}

export function isOutfitUnlocked(id: OutfitId, level: number): boolean {
  return level >= getOutfit(id).minLevel
}

export type PetState = {
  catName: string
  dogName: string
  catOutfit: OutfitId
  dogOutfit: OutfitId
  catPalette: PetPaletteId
  dogPalette: PetPaletteId
}

export const defaultPetState: PetState = {
  catName: '나비',
  dogName: '초코',
  catOutfit: 'none',
  dogOutfit: 'none',
  catPalette: 'cream',
  dogPalette: 'cream',
}

/** 저장된 값 보정 (알 수 없는 outfit → none) */
export function normalizePetState(raw: Partial<PetState> | null | undefined): PetState {
  const validOutfit = (v: unknown): OutfitId =>
    outfits.some((o) => o.id === v) ? (v as OutfitId) : 'none'
  const validPalette = (v: unknown): PetPaletteId =>
    petPalettes.some((p) => p.id === v) ? (v as PetPaletteId) : 'cream'
  return {
    catName: (raw?.catName ?? '').toString().trim() || defaultPetState.catName,
    dogName: (raw?.dogName ?? '').toString().trim() || defaultPetState.dogName,
    catOutfit: validOutfit(raw?.catOutfit),
    dogOutfit: validOutfit(raw?.dogOutfit),
    catPalette: validPalette(raw?.catPalette),
    dogPalette: validPalette(raw?.dogPalette),
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
