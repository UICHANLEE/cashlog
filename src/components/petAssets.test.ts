import { describe, expect, it } from 'vitest'
import { outfits } from '../domain/pet'
import { getPetAssetPath } from './petAssets'

describe('pet costume assets', () => {
  it('uses the original portrait for the default look', () => {
    expect(getPetAssetPath('cat')).toBe('/pets/cat-3d.png')
    expect(getPetAssetPath('dog', 'none')).toBe('/pets/dog-3d.png')
  })

  it('maps every wearable outfit to a character-specific rendered asset', () => {
    for (const outfit of outfits.filter(({ id }) => id !== 'none')) {
      expect(getPetAssetPath('cat', outfit.id)).toBe(
        `/pets/costumes/cat/${outfit.id}.webp`,
      )
      expect(getPetAssetPath('dog', outfit.id)).toBe(
        `/pets/costumes/dog/${outfit.id}.webp`,
      )
    }
  })
})
