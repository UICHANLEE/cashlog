import { describe, expect, it } from 'vitest'
import { getPetPalette, outfits } from '../domain/pet'
import { createPetCostumeDataUrl, createPetCostumeSvg } from './petCostumeArtwork'

describe('pet costume artwork', () => {
  it('renders every wearable outfit as standalone SVG artwork', () => {
    for (const outfit of outfits.filter(({ id }) => id !== 'none')) {
      const svg = createPetCostumeSvg(outfit.id, 'cat', getPetPalette('strawberry'))
      expect(svg).toContain('<svg')
      expect(svg).toContain('#ef476f')
    }
  })

  it('does not create an overlay for the default look', () => {
    expect(createPetCostumeDataUrl('none', 'dog', getPetPalette('cream'))).toBeNull()
  })
})
