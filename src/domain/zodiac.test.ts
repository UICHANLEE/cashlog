import { describe, expect, it } from 'vitest'
import { getZodiacCharacter, zodiacCharacters } from './zodiac'

describe('zodiac character rotation', () => {
  it('maps the current 2026 year to the horse character', () => {
    expect(getZodiacCharacter(2026)).toMatchObject({
      id: 'horse',
      animalName: '말',
      characterName: '달리',
    })
  })

  it('rotates through all twelve animals and wraps cleanly', () => {
    expect(zodiacCharacters).toHaveLength(12)
    expect(getZodiacCharacter(2020).id).toBe('rat')
    expect(getZodiacCharacter(2031).id).toBe('pig')
    expect(getZodiacCharacter(2032).id).toBe('rat')
    expect(getZodiacCharacter(2007).id).toBe('pig')
  })
})
