import { describe, expect, it } from 'vitest'
import { outfits } from '../domain/pet'
import { getPetAssetPath } from './petAssets'

describe('pet costume assets', () => {
  it('uses a real breed portrait for the default look', () => {
    expect(getPetAssetPath('cat')).toBe('/pets/breeds/cat/korean_short.webp')
    expect(getPetAssetPath('dog', 'none', 'corgi')).toBe('/pets/breeds/dog/corgi.webp')
    expect(getPetAssetPath('pig', 'none', 'black_pig')).toBe(
      '/pets/breeds/pig/black_pig.webp',
    )
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

  it('keeps a pig breed visible when an unsupported outfit is selected', () => {
    expect(getPetAssetPath('pig', 'hoodie', 'spotted_pig')).toBe(
      '/pets/breeds/pig/spotted_pig.webp',
    )
  })
})
