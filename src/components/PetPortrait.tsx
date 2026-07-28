import {
  getPetPalette,
  type OutfitId,
  type PetBreedId,
  type PetKind,
  type PetPaletteId,
} from '../domain/pet'
import type { CSSProperties } from 'react'
import { getPetAssetPath } from './petAssets'
import './InteractivePet3D.css'

type PetPortraitProps = {
  kind: PetKind
  name: string
  outfit?: OutfitId
  breed?: PetBreedId
  palette?: PetPaletteId
  className?: string
}

export function PetPortrait({
  kind,
  name,
  outfit = 'none',
  breed,
  palette = 'cream',
  className = '',
}: PetPortraitProps) {
  const assetPath = getPetAssetPath(kind, outfit, breed)
  const colors = getPetPalette(palette)

  return (
    <span
      className={`pet-portrait-3d${palette === 'cream' ? '' : ' is-tinted'}${outfit === 'none' ? '' : ' has-outfit'} ${className}`.trim()}
      style={{
        '--portrait-asset': `url("${assetPath}")`,
        '--portrait-color': colors.body,
        '--portrait-color-alt': colors.bodyAlt,
        '--portrait-accent': colors.accent,
      } as CSSProperties}
    >
      <span className="pet-portrait-aura" aria-hidden="true" />
      <img src={assetPath} alt={`${name} 캐릭터`} draggable={false} />
      <span className="pet-portrait-tint" aria-hidden="true" />
    </span>
  )
}
