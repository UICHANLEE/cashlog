import type { SVGProps } from 'react'
import type { OutfitId } from '../domain/pet'

/** 손그림 톤 공통 상수 */
const INK = '#2a251f'

type DoodleProps = SVGProps<SVGSVGElement> & { outfit?: OutfitId }

/** 코디 액세서리 오버레이 (머리·목 기준, viewBox 0 0 120 132 공통) */
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
        <path d="M36 13 L36 27 L49 20 Z" fill="#ff9ec4" />
        <path d="M62 13 L62 27 L49 20 Z" fill="#ff9ec4" />
        <circle cx="49" cy="20" r="4" fill="#ffd23f" />
      </g>
    )
  }

  if (outfit === 'party') {
    return (
      <g {...common}>
        <path d="M60 0 L46 28 L74 28 Z" fill="#ffd23f" />
        <path d="M53 14 L67 14" stroke="#ff6f59" strokeWidth={3.4} />
        <path d="M50 21 L70 21" stroke="#6cb8ff" strokeWidth={3.4} />
        <circle cx="60" cy="1" r="4.5" fill="#ff9ec4" />
      </g>
    )
  }

  if (outfit === 'glasses') {
    return (
      <g {...common}>
        <circle cx="49" cy="51" r="9" fill="#2a251f" fillOpacity={0.82} />
        <circle cx="71" cy="51" r="9" fill="#2a251f" fillOpacity={0.82} />
        <path d="M58 51 L62 51" strokeWidth={3.4} />
        <path d="M46 47 q3 -3 6 -1" stroke="#fff9ee" strokeWidth={2} fill="none" />
        <path d="M68 47 q3 -3 6 -1" stroke="#fff9ee" strokeWidth={2} fill="none" />
      </g>
    )
  }

  if (outfit === 'scarf') {
    return (
      <g {...common}>
        <path d="M36 80 Q60 92 84 80 L84 88 Q60 100 36 88 Z" fill="#3fc79a" />
        <path d="M74 86 L80 104 L70 102 L68 88 Z" fill="#3fc79a" />
      </g>
    )
  }

  // crown
  return (
    <g {...common}>
      <path d="M42 26 L42 14 L50 21 L56 11 L60 20 L64 11 L70 21 L78 14 L78 26 Z" fill="#ffd23f" />
      <circle cx="56" cy="11" r="2.4" fill="#ff6f59" stroke="none" />
      <circle cx="64" cy="11" r="2.4" fill="#ff6f59" stroke="none" />
    </g>
  )
}

/** 삐뚤빼뚤 손그림 고양이 마스코트 (장식용) */
export function CatDoodle({ className, outfit = 'none', ...rest }: DoodleProps) {
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
      <g
        stroke={INK}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 꼬리 (위로 살랑) */}
        <path d="M80 108 C 108 108, 116 70, 99 63" fill="none" strokeWidth={7} />
        {/* 몸통 */}
        <path d="M37 84 C 28 126, 92 126, 83 84 Z" fill="#ffd7ad" />
        {/* 앞발 */}
        <ellipse cx="50" cy="118" rx="8" ry="6" fill="#ffe6cc" />
        <ellipse cx="70" cy="118" rx="8" ry="6" fill="#ffe6cc" />
        {/* 귀 */}
        <path d="M41 36 L32 9 L59 29 Z" fill="#ffd7ad" />
        <path d="M79 36 L88 9 L61 29 Z" fill="#ffd7ad" />
        <path d="M43 31 L38 16 L52 27 Z" fill="#ff9ec4" stroke="none" />
        <path d="M77 31 L82 16 L68 27 Z" fill="#ff9ec4" stroke="none" />
        {/* 머리 */}
        <ellipse cx="60" cy="54" rx="30" ry="27" fill="#ffd7ad" />
        {/* 볼터치 */}
        <ellipse cx="40" cy="62" rx="5" ry="3.4" fill="#ff9ec4" stroke="none" opacity="0.8" />
        <ellipse cx="80" cy="62" rx="5" ry="3.4" fill="#ff9ec4" stroke="none" opacity="0.8" />
        {/* 눈 (기분좋은 반달) */}
        <path d="M45 52 q6 7 12 0" fill="none" />
        <path d="M63 52 q6 7 12 0" fill="none" />
        {/* 코 */}
        <path d="M56 59 L64 59 L60 64 Z" fill="#ff7a59" stroke="none" />
        {/* 입 */}
        <path d="M60 64 q-5 6 -10 2" fill="none" />
        <path d="M60 64 q5 6 10 2" fill="none" />
        {/* 수염 */}
        <path d="M43 57 L24 53" strokeWidth={2.4} />
        <path d="M43 61 L23 64" strokeWidth={2.4} />
        <path d="M77 57 L96 53" strokeWidth={2.4} />
        <path d="M77 61 L97 64" strokeWidth={2.4} />
      </g>
      <OutfitLayer outfit={outfit} />
    </svg>
  )
}

/** 삐뚤빼뚤 손그림 강아지 마스코트 (장식용) */
export function DogDoodle({ className, outfit = 'none', ...rest }: DoodleProps) {
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
      <g
        stroke={INK}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 꼬리 (위로 살랑) */}
        <path d="M81 108 C 109 106, 116 72, 100 66" fill="none" strokeWidth={7} />
        {/* 몸통 */}
        <path d="M37 84 C 28 126, 92 126, 83 84 Z" fill="#e6c39a" />
        {/* 앞발 */}
        <ellipse cx="50" cy="118" rx="8" ry="6" fill="#f2dcbe" />
        <ellipse cx="70" cy="118" rx="8" ry="6" fill="#f2dcbe" />
        {/* 귀 (늘어진 플롭) */}
        <path d="M37 40 C 13 40, 12 88, 35 76 C 30 62, 30 50, 41 45 Z" fill="#c79a68" />
        <path d="M83 40 C 107 40, 108 88, 85 76 C 90 62, 90 50, 79 45 Z" fill="#c79a68" />
        {/* 머리 */}
        <ellipse cx="60" cy="55" rx="29" ry="26" fill="#e6c39a" />
        {/* 주둥이 */}
        <ellipse cx="60" cy="64" rx="17" ry="13" fill="#f5e3c8" />
        {/* 눈 */}
        <circle cx="49" cy="50" r="3.2" fill={INK} stroke="none" />
        <circle cx="71" cy="50" r="3.2" fill={INK} stroke="none" />
        {/* 볼터치 */}
        <ellipse cx="38" cy="60" rx="5" ry="3.2" fill="#ff9ec4" stroke="none" opacity="0.7" />
        <ellipse cx="82" cy="60" rx="5" ry="3.2" fill="#ff9ec4" stroke="none" opacity="0.7" />
        {/* 코 */}
        <ellipse cx="60" cy="59" rx="5" ry="4" fill={INK} stroke="none" />
        {/* 입 */}
        <path d="M60 63 q-6 8 -12 3" fill="none" />
        <path d="M60 63 q6 8 12 3" fill="none" />
        {/* 혀 */}
        <path d="M55 68 q5 11 10 0 Z" fill="#ff8fb0" />
      </g>
      <OutfitLayer outfit={outfit} />
    </svg>
  )
}
