/** 수입성(환급 등) 여부 → + 위로 모션 vs 지출 − 아래 모션 */
export const looksIncomeLikeSlide = (
  headline: string,
  detail?: string,
): boolean => {
  const haystack = `${headline} ${detail ?? ''}`
  const keys = [
    '환불',
    '입금',
    '수입',
    '캐시백',
    '적립금',
    '환급',
    '급여',
    '월급',
    '상여',
    '성과금',
    '용돈',
    '배당',
    '이자',
  ]
  return keys.some((k) => haystack.includes(k))
}

/** 순지출 방향 스칼라: 지출(+), 수입성(−) 반영 합계
 * explicitIncome이 있으면 키워드보다 우선합니다.
 */
export const netOutflowContribution = (
  headline: string,
  detail: string | undefined,
  amountWon: number,
  explicitIncome?: boolean,
): number => {
  const income =
    typeof explicitIncome === 'boolean'
      ? explicitIncome
      : looksIncomeLikeSlide(headline, detail)
  return income ? -Math.abs(amountWon) : Math.abs(amountWon)
}
