import type { CategoryGroupId } from './cashlog'

export type RewardCard = {
  id: string
  name: string
  issuer: string
  kind: 'credit' | 'check'
  /** 월 환산 연회비 (원) */
  monthlyFee: number
  /** 기본 적립률 (0.01 = 1%) */
  baseRate: number
  /** 대분류별 우대 적립률 */
  categoryRates: Partial<Record<CategoryGroupId, number>>
  /** 월 적립 한도 (원, 없으면 무제한) */
  monthlyCap?: number
  tagline: string
  highlights: string[]
}

/**
 * 대표적인 혜택 유형을 단순화한 내장 카탈로그.
 * 실제 상품과 무관한 시뮬레이션용 예시 카드입니다.
 */
export const rewardCards: RewardCard[] = [
  {
    id: 'daily-life',
    name: '데일리 플러스',
    issuer: '캐시로그 시뮬레이션',
    kind: 'credit',
    monthlyFee: 1000,
    baseRate: 0.005,
    categoryRates: {
      meal: 0.05,
      life: 0.03,
      transit: 0.02,
    },
    monthlyCap: 30000,
    tagline: '식비·생활비 중심 소비에 강해요',
    highlights: ['식사 5%', '생활 3%', '교통 2%'],
  },
  {
    id: 'move-connect',
    name: '무브&커넥트',
    issuer: '캐시로그 시뮬레이션',
    kind: 'credit',
    monthlyFee: 1250,
    baseRate: 0.005,
    categoryRates: {
      transit: 0.07,
      comm: 0.05,
      housing: 0.02,
    },
    monthlyCap: 25000,
    tagline: '교통·통신 고정비가 많을수록 이득',
    highlights: ['교통 7%', '통신 5%', '주거 2%'],
  },
  {
    id: 'all-round',
    name: '올라운드 적립',
    issuer: '캐시로그 시뮬레이션',
    kind: 'credit',
    monthlyFee: 1500,
    baseRate: 0.012,
    categoryRates: {},
    monthlyCap: 40000,
    tagline: '카테고리 구분 없이 전 영역 균일 적립',
    highlights: ['전 가맹점 1.2%', '한도 넉넉'],
  },
  {
    id: 'style-leisure',
    name: '스타일&여가',
    issuer: '캐시로그 시뮬레이션',
    kind: 'credit',
    monthlyFee: 1000,
    baseRate: 0.005,
    categoryRates: {
      fashion: 0.05,
      leisure: 0.05,
      meal: 0.02,
    },
    monthlyCap: 20000,
    tagline: '쇼핑·문화생활 비중이 높을 때',
    highlights: ['의류/미용 5%', '문화/여가 5%'],
  },
  {
    id: 'simple-check',
    name: '심플 체크',
    issuer: '캐시로그 시뮬레이션',
    kind: 'check',
    monthlyFee: 0,
    baseRate: 0.008,
    categoryRates: {
      meal: 0.01,
    },
    tagline: '연회비 없이 부담 없는 기본 적립',
    highlights: ['연회비 0원', '전 가맹점 0.8%'],
  },
]

export type CardSaving = {
  card: RewardCard
  /** 적립 예상액 (한도 적용 후, 원) */
  reward: number
  /** 적립액 − 월 환산 연회비 (원) */
  net: number
  /** 한도에 걸렸는지 */
  capped: boolean
}

/** 대분류별 지출 합계로 카드별 예상 적립/순절약액을 계산해 순절약액 내림차순으로 반환 */
export const computeCardSavings = (
  groupTotals: Partial<Record<CategoryGroupId, number>>,
): CardSaving[] => {
  const entries = Object.entries(groupTotals) as [CategoryGroupId, number][]

  return rewardCards
    .map((card) => {
      let raw = 0
      for (const [group, amount] of entries) {
        if (!amount) continue
        const rate = card.categoryRates[group] ?? card.baseRate
        raw += amount * rate
      }
      const reward =
        card.monthlyCap != null ? Math.min(raw, card.monthlyCap) : raw
      const capped = card.monthlyCap != null && raw > card.monthlyCap
      return {
        card,
        reward: Math.round(reward),
        net: Math.round(reward - card.monthlyFee),
        capped,
      }
    })
    .sort((a, b) => b.net - a.net)
}
