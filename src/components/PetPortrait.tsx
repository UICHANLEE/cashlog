import type { OutfitId, PetKind } from '../domain/pet'
import { getPetAssetPath } from './petAssets'
import './InteractivePet3D.css'

type PetPortraitProps = {
  kind: PetKind
  name: string
  outfit?: OutfitId
  className?: string
}

export function PetPortrait({
  kind,
  name,
  outfit = 'none',
  className = '',
}: PetPortraitProps) {
  return (
    <img
      className={`pet-portrait-3d ${className}`.trim()}
      src={getPetAssetPath(kind, outfit)}
      alt={`${name} 캐릭터`}
      draggable={false}
    />
  )
}
