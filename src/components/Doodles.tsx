import { useId, type SVGProps } from 'react'
import {
  getPetPalette,
  type CatBreedId,
  type DogBreedId,
  type OutfitId,
  type PetPaletteId,
} from '../domain/pet'

const INK = '#2a251f'
const WHITE = '#fffdf8'

type DoodleProps = SVGProps<SVGSVGElement> & {
  outfit?: OutfitId
  palette?: PetPaletteId
  breed?: CatBreedId | DogBreedId
}

const idSafe = (id: string) => id.replace(/:/g, '')

function OutfitLayer({ outfit }: { outfit: OutfitId }) {
  if (!outfit || outfit === 'none') return null

  const common = {
    stroke: INK,
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (outfit === 'bow') {
    return (
      <g {...common}>
        <path d="M37 18 C26 9 20 19 28 31 C34 28 40 25 47 22 Z" fill="#ff7eb6" />
        <path d="M63 18 C74 9 80 19 72 31 C66 28 60 25 53 22 Z" fill="#ff7eb6" />
        <circle cx="50" cy="22" r="5.5" fill="#ffd23f" />
      </g>
    )
  }

  if (outfit === 'party') {
    return (
      <g {...common}>
        <path d="M60 1 C52 13 47 24 44 34 C54 38 66 38 76 34 C72 23 67 12 60 1 Z" fill="#ffd23f" />
        <path d="M51 21 C58 24 65 24 72 21" stroke="#ff6f59" strokeWidth={3.4} />
        <path d="M48 29 C56 32 64 32 73 29" stroke="#7ad7ff" strokeWidth={3.4} />
        <circle cx="60" cy="2" r="5" fill="#ff9ec4" />
      </g>
    )
  }

  if (outfit === 'glasses') {
    return (
      <g {...common}>
        <rect x="38" y="54" width="21" height="15" rx="7" fill="#232124" fillOpacity={0.86} />
        <rect x="64" y="54" width="21" height="15" rx="7" fill="#232124" fillOpacity={0.86} />
        <path d="M59 61 L64 61" strokeWidth={3.4} />
        <path d="M44 58 q5 -3 10 0" stroke={WHITE} strokeWidth={2} fill="none" opacity={0.72} />
        <path d="M70 58 q5 -3 10 0" stroke={WHITE} strokeWidth={2} fill="none" opacity={0.72} />
      </g>
    )
  }

  if (outfit === 'scarf') {
    return (
      <g {...common}>
        <path d="M31 91 C47 102 74 102 91 90 L90 100 C71 112 48 112 31 101 Z" fill="#3fc79a" />
        <path d="M78 97 L87 121 L75 118 L70 100 Z" fill="#3fc79a" />
        <path d="M40 98 C52 104 67 104 82 98" stroke="#c8fff0" strokeWidth={2.2} />
      </g>
    )
  }

  return (
    <g {...common}>
      <path
        d="M39 31 L41 16 L51 25 L60 12 L68 25 L79 16 L81 31 C69 36 52 36 39 31 Z"
        fill="#ffd23f"
      />
      <circle cx="51" cy="24" r="2.8" fill="#ff6f59" stroke="none" />
      <circle cx="60" cy="12" r="3" fill="#7ad7ff" stroke="none" />
      <circle cx="68" cy="24" r="2.8" fill="#ff6f59" stroke="none" />
    </g>
  )
}

function Sparkles() {
  return (
    <g stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" opacity={0.82}>
      <path d="M19 35 L19 45" />
      <path d="M14 40 L24 40" />
      <path d="M101 26 L101 34" />
      <path d="M97 30 L105 30" />
      <circle cx="103" cy="105" r="2.2" fill={WHITE} stroke="none" />
    </g>
  )
}

function CatBreedLayer({ breed, shadow, accent }: { breed: CatBreedId; shadow: string; accent: string }) {
  if (breed === 'cheese_tabby') {
    return (
      <g stroke={shadow} strokeWidth={3} strokeLinecap="round" opacity={0.72}>
        <path d="M50 31 C54 36 57 39 60 42" />
        <path d="M70 32 C66 37 63 40 60 43" />
        <path d="M37 54 C43 51 48 50 53 51" />
        <path d="M67 51 C73 50 79 51 84 54" />
        <path d="M39 93 C43 97 46 100 48 104" />
        <path d="M81 93 C77 97 74 100 72 104" />
      </g>
    )
  }

  if (breed === 'tuxedo') {
    return (
      <g opacity={0.88}>
        <path d="M32 52 C36 32 48 23 60 23 C72 23 84 32 88 52 C75 45 46 45 32 52 Z" fill="#2a2730" />
        <path d="M48 86 C54 97 66 97 72 86 L78 112 C66 122 53 122 42 112 Z" fill="#2a2730" />
        <path d="M51 82 L60 93 L69 82 L65 105 L55 105 Z" fill="#fffdf8" />
      </g>
    )
  }

  if (breed === 'calico') {
    return (
      <g opacity={0.8}>
        <path d="M34 45 C39 29 53 24 61 28 C56 40 50 49 34 45 Z" fill="#f4a261" />
        <path d="M66 29 C79 28 88 40 85 54 C73 51 67 43 66 29 Z" fill="#2a2730" />
        <path d="M43 88 C51 84 59 87 63 96 C55 104 45 101 43 88 Z" fill="#f4a261" />
      </g>
    )
  }

  if (breed === 'siamese') {
    return (
      <g opacity={0.82}>
        <path d="M33 53 C42 40 78 40 87 53 C82 78 38 78 33 53 Z" fill="#6b4a3a" />
        <path d="M31 9 C43 15 51 25 54 37 C44 35 37 25 31 9 Z" fill="#6b4a3a" />
        <path d="M89 9 C77 15 69 25 66 37 C76 35 83 25 89 9 Z" fill="#6b4a3a" />
      </g>
    )
  }

  if (breed === 'russian_blue') {
    return <ellipse cx="60" cy="38" rx="23" ry="10" fill="#dce7ff" opacity="0.36" />
  }

  if (breed === 'persian') {
    return (
      <g fill="#fffdf8" opacity={0.46}>
        <circle cx="33" cy="54" r="11" />
        <circle cx="87" cy="54" r="11" />
        <circle cx="45" cy="86" r="10" />
        <circle cx="75" cy="86" r="10" />
      </g>
    )
  }

  if (breed === 'black_cat') {
    return (
      <g opacity={0.9}>
        <ellipse cx="60" cy="57" rx="34" ry="31" fill="#27242c" />
        <ellipse cx="60" cy="94" rx="26" ry="30" fill="#27242c" />
        <ellipse cx="43" cy="68" rx="6" ry="4" fill={accent} opacity="0.85" />
        <ellipse cx="78" cy="68" rx="6" ry="4" fill={accent} opacity="0.85" />
      </g>
    )
  }

  return null
}

function DogBreedLayer({ breed, shadow, bodyAlt }: { breed: DogBreedId; shadow: string; bodyAlt: string }) {
  if (breed === 'toy_poodle' || breed === 'pomeranian') {
    return (
      <g fill={bodyAlt} opacity={0.58}>
        <circle cx="35" cy="48" r="9" />
        <circle cx="85" cy="48" r="9" />
        <circle cx="47" cy="32" r="8" />
        <circle cx="60" cy="28" r="9" />
        <circle cx="73" cy="32" r="8" />
      </g>
    )
  }

  if (breed === 'shiba') {
    return (
      <g opacity={0.72}>
        <path d="M38 44 C45 28 75 28 82 44 C72 39 48 39 38 44 Z" fill={shadow} />
        <ellipse cx="60" cy="77" rx="18" ry="12" fill={bodyAlt} />
      </g>
    )
  }

  if (breed === 'retriever') {
    return <ellipse cx="48" cy="42" rx="18" ry="10" fill="#ffe6a8" opacity="0.42" />
  }

  if (breed === 'dachshund') {
    return (
      <g opacity={0.78}>
        <path d="M31 44 C15 40 13 75 30 82 C42 71 42 54 31 44 Z" fill="#5f3b25" />
        <path d="M89 44 C105 40 107 75 90 82 C78 71 78 54 89 44 Z" fill="#5f3b25" />
      </g>
    )
  }

  if (breed === 'border_collie') {
    return (
      <g opacity={0.86}>
        <path d="M33 50 C38 29 52 24 61 30 C55 44 47 54 33 50 Z" fill="#24232a" />
        <path d="M65 31 C78 28 89 40 86 56 C74 55 67 45 65 31 Z" fill="#24232a" />
        <path d="M45 86 C53 82 63 86 68 98 C58 105 47 101 45 86 Z" fill="#24232a" />
      </g>
    )
  }

  if (breed === 'corgi') {
    return (
      <g opacity={0.74}>
        <path d="M39 33 L30 13 L52 34 Z" fill={shadow} />
        <path d="M81 33 L90 13 L68 34 Z" fill={shadow} />
        <ellipse cx="60" cy="79" rx="20" ry="12" fill={bodyAlt} />
      </g>
    )
  }

  return null
}

export function CatDoodle({
  className,
  outfit = 'none',
  palette = 'cream',
  breed = 'korean_short',
  ...rest
}: DoodleProps) {
  const colors = getPetPalette(palette)
  const catBreed = breed as CatBreedId
  const uid = idSafe(useId())
  const bodyGradient = `cat-body-${uid}`
  const bellyGradient = `cat-belly-${uid}`

  return (
    <svg
      className={className}
      viewBox="0 0 120 132"
      role="img"
      aria-label="고양이"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <defs>
        <radialGradient id={bodyGradient} cx="34%" cy="25%" r="76%">
          <stop offset="0%" stopColor={colors.bodyAlt} />
          <stop offset="48%" stopColor={colors.body} />
          <stop offset="100%" stopColor={colors.shadow} />
        </radialGradient>
        <linearGradient id={bellyGradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colors.bodyAlt} />
          <stop offset="100%" stopColor={WHITE} />
        </linearGradient>
      </defs>

      <ellipse cx="61" cy="122" rx="36" ry="8" fill={colors.shadow} opacity="0.24" />
      <Sparkles />

      <g stroke={INK} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M83 103 C113 98 109 61 91 62" strokeWidth={8} />
        <path d="M83 103 C106 99 102 70 91 70" stroke={colors.body} strokeWidth={5.5} />

        <ellipse cx="60" cy="94" rx="28" ry="32" fill={`url(#${bodyGradient})`} />
        <ellipse cx="60" cy="101" rx="16" ry="20" fill={`url(#${bellyGradient})`} stroke="none" />
        <ellipse cx="47" cy="121" rx="10" ry="7" fill={colors.bodyAlt} />
        <ellipse cx="73" cy="121" rx="10" ry="7" fill={colors.bodyAlt} />

        <path d="M36 42 C31 27 28 13 31 9 C43 15 51 25 54 37 Z" fill={`url(#${bodyGradient})`} />
        <path d="M84 42 C89 27 92 13 89 9 C77 15 69 25 66 37 Z" fill={`url(#${bodyGradient})`} />
        <path d="M40 34 C38 26 37 21 39 18 C45 23 49 28 51 34 Z" fill={colors.blush} stroke="none" opacity="0.86" />
        <path d="M80 34 C82 26 83 21 81 18 C75 23 71 28 69 34 Z" fill={colors.blush} stroke="none" opacity="0.86" />

        <ellipse cx="60" cy="57" rx="37" ry="34" fill={`url(#${bodyGradient})`} />
        <ellipse cx="47" cy="49" rx="14" ry="10" fill={WHITE} stroke="none" opacity="0.34" />
        <CatBreedLayer breed={catBreed} shadow={colors.shadow} accent={colors.accent} />
        <ellipse cx="43" cy="68" rx="7" ry="4.6" fill={colors.blush} stroke="none" opacity="0.78" />
        <ellipse cx="78" cy="68" rx="7" ry="4.6" fill={colors.blush} stroke="none" opacity="0.78" />

        <ellipse cx="47" cy="58" rx="8.6" ry="10.2" fill={INK} stroke="none" />
        <ellipse cx="73" cy="58" rx="8.6" ry="10.2" fill={INK} stroke="none" />
        <circle cx="44" cy="54" r="2.6" fill={WHITE} stroke="none" />
        <circle cx="70" cy="54" r="2.6" fill={WHITE} stroke="none" />
        <circle cx="51" cy="62" r="1.6" fill={WHITE} stroke="none" opacity="0.62" />
        <circle cx="77" cy="62" r="1.6" fill={WHITE} stroke="none" opacity="0.62" />

        <path d="M56 70 C59 67 62 67 65 70 C63 74 58 74 56 70 Z" fill={colors.accent} stroke="none" />
        <path d="M60 74 C57 80 51 80 48 76" fill="none" />
        <path d="M60 74 C63 80 69 80 72 76" fill="none" />
        <path d="M39 65 L21 60" strokeWidth={2.2} opacity="0.78" />
        <path d="M39 70 L20 72" strokeWidth={2.2} opacity="0.78" />
        <path d="M81 65 L99 60" strokeWidth={2.2} opacity="0.78" />
        <path d="M81 70 L100 72" strokeWidth={2.2} opacity="0.78" />
      </g>

      <OutfitLayer outfit={outfit} />
    </svg>
  )
}

export function DogDoodle({
  className,
  outfit = 'none',
  palette = 'cream',
  breed = 'maltese',
  ...rest
}: DoodleProps) {
  const colors = getPetPalette(palette)
  const dogBreed = breed as DogBreedId
  const uid = idSafe(useId())
  const bodyGradient = `dog-body-${uid}`
  const earGradient = `dog-ear-${uid}`
  const bellyGradient = `dog-belly-${uid}`

  return (
    <svg
      className={className}
      viewBox="0 0 120 132"
      role="img"
      aria-label="강아지"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <defs>
        <radialGradient id={bodyGradient} cx="34%" cy="25%" r="76%">
          <stop offset="0%" stopColor={colors.bodyAlt} />
          <stop offset="52%" stopColor={colors.body} />
          <stop offset="100%" stopColor={colors.shadow} />
        </radialGradient>
        <linearGradient id={earGradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colors.shadow} />
          <stop offset="100%" stopColor={colors.body} />
        </linearGradient>
        <linearGradient id={bellyGradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colors.bodyAlt} />
          <stop offset="100%" stopColor={WHITE} />
        </linearGradient>
      </defs>

      <ellipse cx="61" cy="122" rx="36" ry="8" fill={colors.shadow} opacity="0.24" />
      <Sparkles />

      <g stroke={INK} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M82 102 C106 99 109 76 96 70" strokeWidth={8} />
        <path d="M82 102 C101 99 102 80 95 77" stroke={colors.body} strokeWidth={5.5} />

        <ellipse cx="60" cy="94" rx="28" ry="32" fill={`url(#${bodyGradient})`} />
        <ellipse cx="60" cy="101" rx="16" ry="20" fill={`url(#${bellyGradient})`} stroke="none" />
        <ellipse cx="47" cy="121" rx="10" ry="7" fill={colors.bodyAlt} />
        <ellipse cx="73" cy="121" rx="10" ry="7" fill={colors.bodyAlt} />

        <path d="M35 43 C15 39 12 77 31 83 C41 73 43 55 35 43 Z" fill={`url(#${earGradient})`} />
        <path d="M85 43 C105 39 108 77 89 83 C79 73 77 55 85 43 Z" fill={`url(#${earGradient})`} />

        <ellipse cx="60" cy="58" rx="36" ry="33" fill={`url(#${bodyGradient})`} />
        <ellipse cx="47" cy="50" rx="14" ry="10" fill={WHITE} stroke="none" opacity="0.34" />
        <DogBreedLayer breed={dogBreed} shadow={colors.shadow} bodyAlt={colors.bodyAlt} />
        <ellipse cx="42" cy="69" rx="7" ry="4.6" fill={colors.blush} stroke="none" opacity="0.74" />
        <ellipse cx="79" cy="69" rx="7" ry="4.6" fill={colors.blush} stroke="none" opacity="0.74" />

        <ellipse cx="60" cy="72" rx="19" ry="14" fill={`url(#${bellyGradient})`} />
        <ellipse cx="47" cy="58" rx="8.2" ry="9.8" fill={INK} stroke="none" />
        <ellipse cx="73" cy="58" rx="8.2" ry="9.8" fill={INK} stroke="none" />
        <circle cx="44" cy="54" r="2.6" fill={WHITE} stroke="none" />
        <circle cx="70" cy="54" r="2.6" fill={WHITE} stroke="none" />
        <circle cx="51" cy="62" r="1.5" fill={WHITE} stroke="none" opacity="0.62" />
        <circle cx="77" cy="62" r="1.5" fill={WHITE} stroke="none" opacity="0.62" />

        <ellipse cx="60" cy="68" rx="6" ry="4.8" fill={INK} stroke="none" />
        <path d="M60 72 C56 79 50 80 47 76" fill="none" />
        <path d="M60 72 C64 79 70 80 73 76" fill="none" />
        <path d="M55 79 C59 90 65 90 68 79 Z" fill={colors.blush} />
      </g>

      <OutfitLayer outfit={outfit} />
    </svg>
  )
}
