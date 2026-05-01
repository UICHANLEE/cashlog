const MS_MIN = 60_000
const MS_HOUR = 60 * MS_MIN

/** 하루 로그: ~1분 방금 전, ~1시간 분 전, 그 이후 시간 전 (>1시간이면 시간 단위). */
export function formatDayLogRelativeKo(
  occurred: Date,
  now: Date = new Date(),
): string {
  const delta = now.getTime() - occurred.getTime()
  if (delta <= 0) return '방금 전'
  if (delta > MS_HOUR) return `${Math.floor(delta / MS_HOUR)}시간 전`
  if (delta >= MS_MIN) return `${Math.floor(delta / MS_MIN)}분 전`
  return '방금 전'
}

/** 자정 기준 로컬 캘린더 일 차이(from → to, to가 더 최근이면 양수). */
export function calendarDayDelta(from: Date, to: Date = new Date()): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.floor((b - a) / 86_400_000)
}

/** 한 달(스토리): 같은 날이면 「오늘」, 아니면 「N일 전」. */
export function formatMonthLogRelativeKo(
  occurred: Date,
  now: Date = new Date(),
): string {
  const d = calendarDayDelta(occurred, now)
  if (d <= 0) return '오늘'
  return `${d}일 전`
}
