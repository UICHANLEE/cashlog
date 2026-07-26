import type { OutfitId, PetKind } from '../domain/pet'

export function getPetAssetPath(kind: PetKind, outfit: OutfitId = 'none'): string {
  if (kind === 'pig') return '/pets/pig-3d.webp'
  return outfit === 'none'
    ? `/pets/${kind}-3d.png`
    : `/pets/costumes/${kind}/${outfit}.webp`
}
