import { describe, expect, it } from 'vitest'
import {
  computeLevel,
  isOutfitUnlocked,
  normalizePetState,
  outfits,
  recordsToReachLevel,
} from './pet'

describe('pet growth domain', () => {
  it('starts at level 1 with no records', () => {
    const info = computeLevel(0)
    expect(info.level).toBe(1)
    expect(info.title).toBe('첫 발자국')
    expect(info.remaining).toBe(3)
    expect(info.progress).toBe(0)
  })

  it('levels up as records accumulate', () => {
    expect(computeLevel(3).level).toBe(2)
    expect(computeLevel(7).level).toBe(2)
    expect(computeLevel(8).level).toBe(3)
    expect(computeLevel(40).level).toBe(6)
  })

  it('keeps growing past the base thresholds by 20 each', () => {
    expect(recordsToReachLevel(7)).toBe(60)
    expect(computeLevel(60).level).toBe(7)
    expect(computeLevel(59).level).toBe(6)
  })

  it('reports progress within the current level', () => {
    const info = computeLevel(5) // level 2 (start 3, next 8)
    expect(info.level).toBe(2)
    expect(info.recordsIntoLevel).toBe(2)
    expect(info.recordsForNext).toBe(5)
    expect(info.remaining).toBe(3)
    expect(info.progress).toBeCloseTo(0.4)
  })

  it('unlocks outfits by level', () => {
    expect(isOutfitUnlocked('bow', 1)).toBe(true)
    expect(isOutfitUnlocked('party', 1)).toBe(false)
    expect(isOutfitUnlocked('party', 2)).toBe(true)
    expect(isOutfitUnlocked('crown', 4)).toBe(false)
    expect(isOutfitUnlocked('crown', 5)).toBe(true)
    expect(isOutfitUnlocked('raincoat', 2)).toBe(false)
    expect(isOutfitUnlocked('raincoat', 3)).toBe(true)
  })

  it('organizes the wardrobe into daily, accent, and seasonal collections', () => {
    expect(new Set(outfits.map(({ collection }) => collection))).toEqual(
      new Set(['daily', 'accent', 'season']),
    )
    expect(outfits.find(({ id }) => id === 'pajamas')?.collection).toBe('season')
  })

  it('normalizes stored pet state and drops unknown outfits', () => {
    expect(normalizePetState(null)).toEqual({
      selectedKind: 'cat',
      catName: '나비',
      dogName: '초코',
      catBreed: 'korean_short',
      dogBreed: 'maltese',
      catOutfit: 'none',
      dogOutfit: 'none',
      catPalette: 'cream',
      dogPalette: 'cream',
    })
    expect(
      normalizePetState({
        selectedKind: 'dog',
        catBreed: 'calico',
        dogBreed: 'corgi',
        catOutfit: 'crown',
        dogOutfit: 'bogus' as never,
        catPalette: 'mint',
        dogPalette: 'unknown' as never,
      }),
    ).toMatchObject({
      selectedKind: 'dog',
      catBreed: 'calico',
      dogBreed: 'corgi',
      catOutfit: 'crown',
      dogOutfit: 'none',
      catPalette: 'mint',
      dogPalette: 'cream',
    })
  })

  it('falls back to the default pet and breed for unknown stored values', () => {
    expect(
      normalizePetState({
        selectedKind: 'rabbit' as never,
        catBreed: 'lynx' as never,
        dogBreed: 'wolf' as never,
      }),
    ).toMatchObject({
      selectedKind: 'cat',
      catBreed: 'korean_short',
      dogBreed: 'maltese',
    })
  })
})
