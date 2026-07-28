import type { OutfitId, PetBreedId, PetKind } from '../domain/pet'

const defaultBreedByKind: Record<PetKind, PetBreedId> = {
  cat: 'korean_short',
  dog: 'maltese',
  pig: 'pink_pig',
}

export function getPetAssetPath(
  kind: PetKind,
  outfit: OutfitId = 'none',
  breed: PetBreedId = defaultBreedByKind[kind],
): string {
  if (outfit === 'none') return `/pets/breeds/${kind}/${breed}.webp`
  if (kind === 'pig') return `/pets/breeds/pig/${breed}.webp`
  return `/pets/costumes/${kind}/${outfit}.webp`
}
