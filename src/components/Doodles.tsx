import { useId, type SVGProps } from 'react'
import { getPetPalette, type OutfitId, type PetPaletteId } from '../domain/pet'

const INK = '#2a251f'
const WHITE = '#fffdf8'

type DoodleProps = SVGProps<SVGSVGElement> & {
  outfit?: OutfitId
  palette?: PetPaletteId
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

export function CatDoodle({ className, outfit = 'none', palette = 'cream', ...rest }: DoodleProps) {
  const colors = getPetPalette(palette)
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

export function DogDoodle({ className, outfit = 'none', palette = 'cream', ...rest }: DoodleProps) {
  const colors = getPetPalette(palette)
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
