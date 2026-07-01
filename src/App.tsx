import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { analyzePhoto } from './ai/analyzePhoto'
import { captureFrameFromVideo } from './camera/captureFromVideo'
import {
  categoryTree,
  type CategoryId,
  createExpenseFromAnalysis,
  createManualExpense,
  type Expense,
  dayExpenseTotal,
  dayIncomeTotal,
  formatCategoryLabel,
  formatCurrency,
  formatIncomeCategoryLabel,
  formatLedgerCategory,
  generateDailyLog,
  getCalendarDays,
  getStoryEntriesForMonth,
  getExpensesForDate,
  getCategoryMeta,
  getIncomeCategoryMeta,
  getMonthlyExpenseTotal,
  getMonthlyIncomeTotal,
  type IncomeCategoryId,
  incomeCategoryTree,
  type LedgerCategoryId,
  type LedgerKind,
  ledgerAccentColor,
  migrateCategoryId,
  migrateIncomeCategoryId,
  type PhotoAnalysis,
} from './domain/cashlog'
import {
  formatDayLogRelativeKo,
  formatMonthLogRelativeKo,
} from './domain/relativeLabelsKo'
import { StoryReel, type StorySlide } from './story/StoryReel'

type AddMode = 'closed' | 'choice' | 'photo' | 'manual'
type StoryMode = null | 'day' | 'month'
type CaptureMode = 'photo' | 'video'
type BuddyType = 'cat' | 'dog'

type ExpenseForm = {
  title: string
  amount: string
  category: LedgerCategoryId
  memo: string
  kind: LedgerKind
}

type MonthlyInsight = {
  topCategoryLabel: string
  topCategoryShare: number
  topCategoryAmount: number
  topCategoryColor: string
  priciestDayLabel: string
  priciestDayAmount: number
  photoCount: number
  logCount: number
}

type BadgeState = {
  id: string
  label: string
  detail: string
  unlocked: boolean
}

const STORAGE_KEY = 'cashlog.expenses'
const BUDDY_STORAGE_KEY = 'cashlog.buddy'

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const moveIsoDate = (isoDate: string, delta: number) => {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return date.toISOString().slice(0, 10)
}

const formatSignedCurrency = (amount: number) => {
  if (amount === 0) return '0원'
  return amount > 0 ? `+${formatCurrency(amount)}` : `-${formatCurrency(Math.abs(amount))}`
}

const calculateRecordStreak = (records: Expense[], anchorIsoDate = todayIsoDate()) => {
  const recordedDays = new Set(records.map((expense) => expense.dateTime.slice(0, 10)))
  let cursor = anchorIsoDate
  let streak = 0

  while (recordedDays.has(cursor)) {
    streak += 1
    cursor = moveIsoDate(cursor, -1)
  }

  return streak
}

const buildMonthlyInsight = (
  entries: Expense[],
  monthlyExpense: number,
  yearMonth: string,
): MonthlyInsight => {
  const expenseEntries = entries.filter((entry) => entry.kind !== 'income')
  const categoryTotals = new Map<CategoryId, number>()
  const dayTotals = new Map<string, number>()

  expenseEntries.forEach((entry) => {
    const category = migrateCategoryId(String(entry.category))
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + entry.amount)

    const isoDate = entry.dateTime.slice(0, 10)
    dayTotals.set(isoDate, (dayTotals.get(isoDate) ?? 0) + entry.amount)
  })

  const [topCategoryId, topCategoryAmount = 0] =
    [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  const topCategoryMeta = getCategoryMeta(topCategoryId ?? 'misc_uncat')
  const [priciestDate, priciestDayAmount = 0] =
    [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? []

  return {
    topCategoryLabel:
      topCategoryAmount > 0
        ? `${topCategoryMeta.group.name} · ${topCategoryMeta.leaf.name}`
        : '기록 대기',
    topCategoryShare:
      monthlyExpense > 0 ? Math.round((topCategoryAmount / monthlyExpense) * 100) : 0,
    topCategoryAmount,
    topCategoryColor: topCategoryMeta.group.color,
    priciestDayLabel: priciestDate ? priciestDate.slice(5).replace('-', '.') : `${yearMonth} 준비 중`,
    priciestDayAmount,
    photoCount: entries.filter((entry) => entry.source === 'photo').length,
    logCount: entries.length,
  }
}

const buildBadgeStates = (
  entries: Expense[],
  recordStreak: number,
  monthlyExpense: number,
  monthlyIncome: number,
): BadgeState[] => [
  {
    id: 'first-log',
    label: '첫 로그',
    detail: '소비나 수입을 한 번이라도 남기기',
    unlocked: entries.length > 0,
  },
  {
    id: 'story-maker',
    label: '스토리 메이커',
    detail: '사진이나 영상 기록 1개 이상',
    unlocked: entries.some((entry) => entry.source === 'photo'),
  },
  {
    id: 'streak-three',
    label: '3일 스트릭',
    detail: '3일 연속 기록하기',
    unlocked: recordStreak >= 3,
  },
  {
    id: 'flow-balance',
    label: '밸런스 플로우',
    detail: '월 지출을 수입의 80% 이하로 유지',
    unlocked: monthlyIncome > 0 && monthlyExpense <= monthlyIncome * 0.8,
  },
]

const triggerSoftFeedback = () => {
  if (typeof navigator === 'undefined') return
  navigator.vibrate?.(14)
}

const buddyProfiles: Record<
  BuddyType,
  {
    type: BuddyType
    name: string
    shortName: string
    label: string
    imageUrl: string
    alt: string
    tone: string
    emptyNudge: string
    positiveNudge: string
    spendingNudge: string
    missionPrefix: string
  }
> = {
  cat: {
    type: 'cat',
    name: '캐시냥',
    shortName: '냥이',
    label: '고양이',
    imageUrl: '/cashlog-cat-buddy.png',
    alt: '영수증과 동전을 들고 있는 Cashlog 고양이 캐릭터',
    tone: '차분하게 소비 패턴을 같이 정리해요.',
    emptyNudge: '오늘은 아직 조용해요. 사진 한 장으로 시작해볼까요?',
    positiveNudge: '오늘 흐름이 좋아요. 남은 돈을 스토리로 저장해둘게요.',
    spendingNudge: '오늘 쓴 순간들이 쌓였어요. 어떤 소비가 제일 기억나나요?',
    missionPrefix: '차분한 리캡',
  },
  dog: {
    type: 'dog',
    name: '캐시멍',
    shortName: '멍이',
    label: '강아지',
    imageUrl: '/cashlog-dog-buddy.png',
    alt: '영수증과 동전을 들고 있는 Cashlog 강아지 캐릭터',
    tone: '활기차게 기록을 밀어주고 다음 행동을 제안해요.',
    emptyNudge: '오늘 첫 기록 산책을 나가볼까요? 10초면 충분해요.',
    positiveNudge: '좋아요. 오늘 현금 흐름이 가볍게 뛰고 있어요.',
    spendingNudge: '오늘 소비가 조금 달렸어요. 같이 숨 고르고 리캡해봐요.',
    missionPrefix: '빠른 액션',
  },
}

const loadBuddyType = (): BuddyType => {
  try {
    const stored = localStorage.getItem(BUDDY_STORAGE_KEY)
    return stored === 'dog' || stored === 'cat' ? stored : 'cat'
  } catch {
    return 'cat'
  }
}

const loadExpenses = (): Expense[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as Expense[]
    return parsed.map((expense) => {
      const kind = expense.kind === 'income' ? 'income' : 'expense'
      const category =
        kind === 'income'
          ? migrateIncomeCategoryId(String(expense.category))
          : migrateCategoryId(String(expense.category))
      return {
        ...expense,
        kind,
        category,
        createdAt: expense.createdAt ?? expense.updatedAt ?? expense.dateTime,
        updatedAt: expense.updatedAt ?? expense.createdAt ?? expense.dateTime,
      }
    })
  } catch {
    return []
  }
}

const defaultExpenseLeafId = categoryTree[0]?.leaves[0]?.id ?? 'misc_uncat'
const defaultIncomeLeafId =
  incomeCategoryTree[0]?.leaves[0]?.id ?? ('inc_uncat' as IncomeCategoryId)

const emptyForm = (): ExpenseForm => ({
  title: '',
  amount: '',
  category: defaultExpenseLeafId,
  memo: '',
  kind: 'expense',
})

function App() {
  const now = new Date()
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses)
  const [buddyType, setBuddyType] = useState<BuddyType>(loadBuddyType)
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [visibleMonth, setVisibleMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  })
  const [addMode, setAddMode] = useState<AddMode>('closed')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo')
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(5)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [photoPreview, setPhotoPreview] = useState('')
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [storyMode, setStoryMode] = useState<StoryMode>(null)
  const [relativeMinuteTick, setRelativeMinuteTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setRelativeMinuteTick((x) => x + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const stopCamera = useCallback(() => {
    setCameraStream((current) => {
      current?.getTracks().forEach((track) => track.stop())
      return null
    })
    setCameraError(null)
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
  }, [])

  const revokeAndClearPreview = useCallback(() => {
    setPhotoPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return ''
    })
    setAnalysis(null)
  }, [])

  const applyPhotoFile = useCallback(async (file: File) => {
    setCameraError(null)
    setPhotoPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setAnalysis(null)

    try {
      const nextAnalysis = await analyzePhoto(file)
      setAnalysis(nextAnalysis)
      setForm({
        title: nextAnalysis.suggestedTitle,
        amount: String(nextAnalysis.suggestedAmount),
        category: nextAnalysis.suggestedCategory,
        memo: nextAnalysis.suggestedMemo,
        kind: 'expense',
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : '사진 분석에 실패했어요.'
      setCameraError(message)
      setForm(emptyForm())
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraStream) {
      return undefined
    }
    video.srcObject = cameraStream
    video.play().catch(() => {
      setCameraError('카메라 화면을 재생할 수 없어요.')
    })
    return () => {
      video.srcObject = null
    }
  }, [cameraStream])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
  }, [expenses])

  useEffect(() => {
    localStorage.setItem(BUDDY_STORAGE_KEY, buddyType)
  }, [buddyType])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const selectedExpenses = useMemo(
    () => getExpensesForDate(expenses, selectedDate),
    [expenses, selectedDate],
  )
  const selectedDayExpense = dayExpenseTotal(selectedExpenses)
  const selectedDayIncome = dayIncomeTotal(selectedExpenses)
  const selectedDayNet = selectedDayIncome - selectedDayExpense
  const recordedDateCount = useMemo(
    () => new Set(expenses.map((expense) => expense.dateTime.slice(0, 10))).size,
    [expenses],
  )
  const recordStreak = useMemo(() => calculateRecordStreak(expenses), [expenses])
  const level = Math.max(1, Math.floor(expenses.length / 4) + 1)
  const buddy = buddyProfiles[buddyType]
  const streakLabel = recordStreak > 0 ? `${recordStreak}일 스트릭` : '첫 기록 대기'
  const buddyMood =
    selectedExpenses.length === 0
      ? buddy.emptyNudge
      : selectedDayNet >= 0
        ? buddy.positiveNudge
        : buddy.spendingNudge
  const nextMission =
    selectedExpenses.length === 0
      ? `${buddy.missionPrefix}: 첫 소비나 수입을 10초 안에 남기기`
      : selectedExpenses.some((expense) => expense.source === 'photo')
        ? `${buddy.missionPrefix}: 하루 스토리로 오늘 소비 리캡 보기`
        : `${buddy.missionPrefix}: 사진 기록 하나 추가해서 피드를 더 생생하게 만들기`
  const dailyLog = useMemo(
    () => generateDailyLog(selectedDate, expenses),
    [expenses, selectedDate],
  )
  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  )
  const yearMonth = useMemo(
    () => `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, '0')}`,
    [visibleMonth.year, visibleMonth.month],
  )
  const monthlyExpense = getMonthlyExpenseTotal(expenses, yearMonth)
  const monthlyIncome = getMonthlyIncomeTotal(expenses, yearMonth)
  const monthlyNet = monthlyIncome - monthlyExpense
  const monthStoryEntries = useMemo(
    () => getStoryEntriesForMonth(expenses, yearMonth),
    [expenses, yearMonth],
  )
  const monthlyInsight = useMemo(
    () => buildMonthlyInsight(monthStoryEntries, monthlyExpense, yearMonth),
    [monthStoryEntries, monthlyExpense, yearMonth],
  )
  const badgeStates = useMemo(
    () => buildBadgeStates(monthStoryEntries, recordStreak, monthlyExpense, monthlyIncome),
    [monthStoryEntries, monthlyExpense, monthlyIncome, recordStreak],
  )
  const unlockedBadgeCount = badgeStates.filter((badge) => badge.unlocked).length

  const moveVisibleMonth = (delta: number) => {
    triggerSoftFeedback()
    setVisibleMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const expenseToSlide = useCallback((expense: Expense, mode: 'day' | 'month') => {
    const dt = new Date(expense.dateTime)
    const relLabel =
      mode === 'day' ? formatDayLogRelativeKo(dt) : formatMonthLogRelativeKo(dt)
    const img = expense.imageUrl?.trim()
    const baseDetail = `${formatLedgerCategory(expense)}${expense.memo ? ` · ${expense.memo}` : ''}`
    return {
      id: expense.id,
      ...(img ? { imageUrl: img } : {}),
      mediaType: expense.mediaType ?? 'photo',
      headline: expense.title,
      amountLabel: formatCurrency(expense.amount),
      amountWon: expense.amount,
      isIncome: expense.kind === 'income',
      detail: `${relLabel} · ${baseDetail}`,
    } satisfies StorySlide
  }, [])

  const dayStorySlides: StorySlide[] = useMemo(() => {
    void relativeMinuteTick
    const entries = selectedExpenses
    if (entries.length === 0) {
      return [
        {
          id: `day-empty-cover-${selectedDate}`,
          variant: 'cover',
          headline: `${selectedDate} 리캡 준비 중`,
          amountLabel: '첫 장면 대기',
          amountWon: 0,
          detail: '오늘의 첫 기록을 남기면 하루 스토리가 자동으로 만들어져요.',
          durationMs: 2800,
          summaryLines: [
            `${buddy.name}와 사진 기록하기`,
            '수입·지출 직접 입력',
            '하루 끝에 리캡 보기',
          ],
        },
        {
          id: `day-empty-guide-${selectedDate}`,
          variant: 'summary',
          headline: `${buddy.name}의 하루 스토리 사용법`,
          amountLabel: '3초 리캡',
          amountWon: 0,
          detail: '금액은 위아래 모션으로, 사진은 풀스크린으로, 메모는 카드처럼 보여줘요.',
          durationMs: 4200,
          summaryLines: ['오른쪽 탭: 다음 장', '왼쪽 탭: 이전 장', 'ESC: 닫기'],
        },
      ]
    }
    const spent = dayExpenseTotal(entries)
    const earned = dayIncomeTotal(entries)
    const net = earned - spent
    return [
      {
        id: `day-cover-${selectedDate}`,
        variant: 'cover',
        headline: `${selectedDate} 머니 리캡`,
        amountLabel: formatSignedCurrency(net),
        amountWon: 0,
        detail: net >= 0 ? '오늘은 돈이 남았어요' : '오늘의 순지출',
        durationMs: 2400,
        summaryLines: [`지출 ${formatCurrency(spent)}`, `수입 ${formatCurrency(earned)}`],
      },
      ...entries.map((e) => expenseToSlide(e, 'day')),
      {
        id: `day-summary-${selectedDate}`,
        variant: 'summary',
        headline: '하루 저장 완료',
        amountLabel: `${entries.length}개 기록`,
        amountWon: 0,
        detail: dailyLog.summary,
        durationMs: 3600,
        summaryLines: entries.slice(0, 3).map((entry) => entry.title),
      },
    ]
  }, [
    buddy.name,
    dailyLog.summary,
    expenseToSlide,
    relativeMinuteTick,
    selectedDate,
    selectedExpenses,
  ])

  const monthStorySlides: StorySlide[] = useMemo(() => {
    void relativeMinuteTick
    const entries = monthStoryEntries
    if (entries.length === 0) {
      return [
        {
          id: `month-empty-cover-${yearMonth}`,
          variant: 'cover',
          headline: `${visibleMonth.month + 1}월 스토리 보드`,
          amountLabel: '기록 대기',
          amountWon: 0,
          detail: `이번 달 기록이 쌓이면 ${buddy.name}이 소비 흐름을 숏폼처럼 묶어줘요.`,
          durationMs: 3000,
          summaryLines: ['월간 지출 흐름', '수입·지출 순흐름', '기억나는 소비 장면'],
        },
        {
          id: `month-empty-guide-${yearMonth}`,
          variant: 'summary',
          headline: `${buddy.name}의 월간 스토리 사용법`,
          amountLabel: '자동 편집',
          amountWon: 0,
          detail: '한 달 동안 남긴 기록을 시간순으로 재생하고 마지막에 요약해요.',
          durationMs: 4200,
          summaryLines: ['캘린더에서 날짜 선택', '사진/직접 기록 추가', '월말에 리캡 재생'],
        },
      ]
    }
    const spent = dayExpenseTotal(entries)
    const earned = dayIncomeTotal(entries)
    const net = earned - spent
    return [
      {
        id: `month-cover-${yearMonth}`,
        variant: 'cover',
        headline: `${visibleMonth.month + 1}월 머니 스토리`,
        amountLabel: formatSignedCurrency(net),
        amountWon: 0,
        detail: `${entries.length}개 기록으로 만든 월간 리캡`,
        durationMs: 2600,
        summaryLines: [`지출 ${formatCurrency(spent)}`, `수입 ${formatCurrency(earned)}`],
      },
      ...entries.map((e) => expenseToSlide(e, 'month')),
      {
        id: `month-summary-${yearMonth}`,
        variant: 'summary',
        headline: '월간 로그',
        amountLabel: `${entries.length}개 기록`,
        amountWon: 0,
        detail: net >= 0 ? '이번 달 현금 흐름은 플러스예요' : '이번 달 지출 흐름을 확인했어요',
        durationMs: 3800,
        summaryLines: entries.slice(-3).map((entry) => entry.title),
      },
    ]
  }, [
    expenseToSlide,
    buddy.name,
    monthStoryEntries,
    relativeMinuteTick,
    visibleMonth.month,
    yearMonth,
  ])

  const openChoice = () => {
    triggerSoftFeedback()
    stopCamera()
    revokeAndClearPreview()
    setForm(emptyForm())
    setCaptureMode('photo')
    setAddMode('choice')
  }

  const handleBuddyChange = (next: BuddyType) => {
    triggerSoftFeedback()
    setBuddyType(next)
  }

  const openManual = () => {
    triggerSoftFeedback()
    stopCamera()
    revokeAndClearPreview()
    setForm(emptyForm())
    setAddMode('manual')
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('이 브라우저에서는 카메라를 사용할 수 없어요.')
      return
    }
    setCameraError(null)
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      setCameraStream(stream)
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
        setCameraStream(stream)
      } catch (err) {
        const e = err as DOMException
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setCameraError(
            '카메라 권한이 필요해요. 브라우저 설정에서 허용한 뒤 다시 시도해 주세요.',
          )
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setCameraError('사용할 수 있는 카메라를 찾지 못했어요.')
        } else {
          setCameraError('카메라를 켤 수 없어요. HTTPS 또는 localhost에서 다시 시도해 주세요.')
        }
      }
    }
  }

  const handleCapturePhoto = async () => {
    const video = videoRef.current
    if (!video || !cameraStream) return
    setCameraError(null)
    const blob = await captureFrameFromVideo(video)
    if (!blob) {
      setCameraError('촬영 이미지를 만들지 못했어요. 잠시 후 다시 눌러 주세요.')
      return
    }
    const file = new File([blob], `cashlog-capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
    stopCamera()
    await applyPhotoFile(file)
  }

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const amount = Number(form.amount)
    if (!form.title.trim() || Number.isNaN(amount) || amount <= 0) return

    const dateTime = new Date(`${selectedDate}T12:00:00`).toISOString()
    const categoryNormalized: LedgerCategoryId =
      form.kind === 'income'
        ? migrateIncomeCategoryId(String(form.category))
        : migrateCategoryId(String(form.category))
    const expense =
      addMode === 'photo' && photoPreview
        ? analysis
          ? {
              ...createExpenseFromAnalysis({
                analysis,
                imageUrl: photoPreview,
                dateTime,
              }),
              title: form.title.trim(),
              amount,
              category: categoryNormalized,
              memo: form.memo.trim(),
              kind: form.kind,
            }
          : {
              ...createManualExpense({
                title: form.title.trim(),
                amount,
                category: categoryNormalized,
                memo: form.memo.trim(),
                dateTime,
                kind: form.kind,
              }),
              source: 'photo' as const,
              imageUrl: photoPreview,
            }
        : createManualExpense({
            title: form.title.trim(),
            amount,
            category: categoryNormalized,
            memo: form.memo.trim(),
            dateTime,
            kind: form.kind,
          })

    setExpenses((current) => [expense, ...current])
    triggerSoftFeedback()
    stopCamera()
    setAddMode('closed')
  }

  const updateForm = (field: keyof ExpenseForm, value: string | LedgerKind) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const closeStory = useCallback(() => setStoryMode(null), [])

  const openStory = useCallback((mode: Exclude<StoryMode, null>) => {
    triggerSoftFeedback()
    setStoryMode(mode)
  }, [])

  const handleSaveMonthlyShareCard = useCallback(() => {
    triggerSoftFeedback()

    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920)
    gradient.addColorStop(0, '#fff3a6')
    gradient.addColorStop(0.45, '#f9fbff')
    gradient.addColorStop(1, '#d7f7ec')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1080, 1920)

    ctx.fillStyle = 'rgba(255,255,255,0.74)'
    ctx.fillRect(64, 76, 952, 1768)
    ctx.fillStyle = '#111111'
    ctx.font = '900 62px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Cashlog Monthly Story', 108, 190)
    ctx.font = '800 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#5f626b'
    ctx.fillText(`${visibleMonth.year}년 ${visibleMonth.month + 1}월 · ${buddy.name} 리캡`, 108, 260)

    ctx.fillStyle = '#111111'
    ctx.font = '950 112px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(formatCurrency(monthlyExpense), 108, 470)
    ctx.font = '800 36px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#5f626b'
    ctx.fillText('이번 달 지출', 112, 540)

    const rows = [
      ['최다 카테고리', `${monthlyInsight.topCategoryLabel} ${monthlyInsight.topCategoryShare}%`],
      ['가장 비싼 하루', `${monthlyInsight.priciestDayLabel} · ${formatCurrency(monthlyInsight.priciestDayAmount)}`],
      ['기록 스트릭', `${recordStreak}일 연속 · 배지 ${unlockedBadgeCount}/${badgeStates.length}`],
      ['스토리 장면', `${monthlyInsight.logCount}개 기록 · 사진/영상 ${monthlyInsight.photoCount}개`],
    ]

    rows.forEach(([label, value], index) => {
      const y = 720 + index * 210
      ctx.fillStyle = index % 2 === 0 ? '#111111' : '#2f6f86'
      ctx.fillRect(108, y - 96, 864, 148)
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText(label, 148, y - 42)
      ctx.font = '950 48px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText(value, 148, y + 20, 760)
    })

    ctx.fillStyle = '#ff5f4f'
    ctx.fillRect(108, 1618, 864, 90)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('SNS처럼 가볍게, 소비 습관은 선명하게.', 148, 1676)

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cashlog-${yearMonth}-monthly-story.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [
    badgeStates.length,
    buddy.name,
    monthlyExpense,
    monthlyInsight,
    recordStreak,
    unlockedBadgeCount,
    visibleMonth.month,
    visibleMonth.year,
    yearMonth,
  ])

  const handleLedgerKindChange = useCallback((kind: LedgerKind) => {
    setForm((f) => ({
      ...f,
      kind,
      category: kind === 'expense' ? defaultExpenseLeafId : defaultIncomeLeafId,
    }))
  }, [])

  return (
    <main className="app-shell">
      <nav className="top-nav" aria-label="앱">
        <div className="brand-mark">
          <span aria-hidden>CL</span>
          <strong>Cashlog</strong>
        </div>
        <div className="nav-pills" aria-label="현재 보기">
          <span>Diary</span>
          <span>Story</span>
          <span>Cards</span>
        </div>
      </nav>

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Photo-first money OS</p>
          <h1>
            돈의 하루를
            <span>스토리로.</span>
          </h1>
          <p className="hero-copy">
            지출, 수입, 사진 기록을 한 화면에서 모아보고 오늘의 흐름을 짧은 리캡처럼 되감아요.
          </p>
          <div className="hero-signal-row" aria-label="주요 상태">
            <span>Live local</span>
            <span>Vision-ready</span>
            <span>{selectedExpenses.length} logs today</span>
          </div>
        </div>
        <div className="hero-actions">
          <section className="buddy-card" aria-label="캐릭터 에이전트">
            <img
              src={buddy.imageUrl}
              alt={buddy.alt}
            />
            <div className="buddy-copy">
              <p className="eyebrow">Cash agent</p>
              <h2>{buddy.name}이 함께 보는 오늘</h2>
              <p>{buddyMood}</p>
            </div>
            <div className="buddy-stats" aria-label="기록 레벨">
              <span>{streakLabel}</span>
              <span>Lv.{level}</span>
            </div>
            <div className="buddy-picker" role="group" aria-label="캐릭터 선택">
              {(['cat', 'dog'] as const).map((type) => {
                const profile = buddyProfiles[type]
                return (
                  <button
                    key={type}
                    type="button"
                    className={buddyType === type ? 'active' : ''}
                    aria-pressed={buddyType === type}
                    onClick={() => handleBuddyChange(type)}
                  >
                    <img src={profile.imageUrl} alt="" />
                    <span>{profile.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="buddy-agent-note">{buddy.tone}</p>
          </section>
          <div className="hero-month-stats">
            <div>
              <span>이번 달 지출</span>
              <strong>{formatCurrency(monthlyExpense)}</strong>
            </div>
            <div>
              <span>이번 달 수입</span>
              <strong className={monthlyIncome > 0 ? 'hero-stat-income' : undefined}>
                {formatCurrency(monthlyIncome)}
              </strong>
            </div>
            <div className={monthlyNet >= 0 ? 'net-positive' : 'net-negative'}>
              <span>월 순흐름</span>
              <strong>{formatSignedCurrency(monthlyNet)}</strong>
            </div>
          </div>
          <button type="button" className="primary-button" onClick={openChoice}>
            + 기록 추가
          </button>
        </div>
      </section>

      <section className="quick-panel" aria-label="오늘 요약">
        <div>
          <span>오늘 지출</span>
          <strong>{formatCurrency(selectedDayExpense)}</strong>
        </div>
        <div>
          <span>오늘 수입</span>
          <strong>{formatCurrency(selectedDayIncome)}</strong>
        </div>
        <div className={selectedDayNet >= 0 ? 'net-positive' : 'net-negative'}>
          <span>오늘 순흐름</span>
          <strong>{formatSignedCurrency(selectedDayNet)}</strong>
        </div>
      </section>

      <section className="personal-feed" aria-label="개인화 피드">
        <article className="feed-card feed-card-primary">
          <span>오늘의 미션</span>
          <strong>{nextMission}</strong>
          <small>{selectedExpenses.length > 0 ? '기록을 이어가면 스토리 카드가 더 풍성해져요.' : `첫 기록을 남기면 ${buddy.name}이 오늘 리캡을 만들어줘요.`}</small>
        </article>
        <article className="feed-card">
          <span>취향 신호</span>
          <strong>{selectedExpenses.length > 0 ? `${selectedExpenses[0]?.title} 중심의 하루` : '아직 데이터 수집 중'}</strong>
          <small>소비 습관이 쌓이면 메시지와 추천이 더 개인화돼요.</small>
        </article>
        <article className="feed-card">
          <span>배지</span>
          <strong>{selectedExpenses.length >= 3 ? '리캡러 배지 활성화' : '첫 로그 배지 준비 중'}</strong>
          <small>사진, 수입, 메모 기록을 섞으면 새 배지가 열려요.</small>
        </article>
      </section>

      <section className="story-dock" aria-label="스토리 바로가기">
        <article className="story-dock-card story-dock-day">
          <div>
            <span>Today Story</span>
            <strong>{selectedDate} 하루 리캡</strong>
            <small>
              {selectedExpenses.length > 0
                ? `${selectedExpenses.length}개 기록을 숏폼처럼 재생해요.`
                : '아직 기록이 없어도 사용법 스토리를 볼 수 있어요.'}
            </small>
          </div>
          <button type="button" onClick={() => openStory('day')} aria-label="오늘 리캡 열기">
            오늘 리캡 보기
          </button>
        </article>
        <article className="story-dock-card story-dock-month">
          <div>
            <span>Month Story</span>
            <strong>{visibleMonth.month + 1}월 소비 스토리</strong>
            <small>
              {monthStoryEntries.length > 0
                ? `${monthStoryEntries.length}개 장면으로 월간 흐름을 정리해요.`
                : '이번 달 기록이 쌓이면 월간 리캡이 자동으로 풍성해져요.'}
            </small>
          </div>
          <button type="button" onClick={() => openStory('month')} aria-label="월간 리캡 열기">
            월간 리캡 보기
          </button>
        </article>
      </section>

      <section className="wrapped-panel" aria-label="이번 달 소비 요약">
        <article className="wrapped-card">
          <div className="wrapped-card-header">
            <div>
              <p className="eyebrow">Monthly Wrapped</p>
              <h2>{visibleMonth.month + 1}월 소비 요약</h2>
            </div>
            <button type="button" onClick={handleSaveMonthlyShareCard}>
              저장/공유 카드
            </button>
          </div>
          <div className="wrapped-hero-metric">
            <span>이번 달 지출</span>
            <strong>{formatCurrency(monthlyExpense)}</strong>
            <small>
              {monthlyNet >= 0
                ? `수입 대비 ${formatSignedCurrency(monthlyNet)} 남았어요.`
                : `수입 대비 ${formatCurrency(Math.abs(monthlyNet))} 더 썼어요.`}
            </small>
          </div>
          <div className="wrapped-metrics">
            <div>
              <span>최다 카테고리</span>
              <strong style={{ color: monthlyInsight.topCategoryColor }}>
                {monthlyInsight.topCategoryLabel}
              </strong>
              <small>
                {monthlyInsight.topCategoryShare > 0
                  ? `${monthlyInsight.topCategoryShare}% · ${formatCurrency(monthlyInsight.topCategoryAmount)}`
                  : '첫 지출을 남기면 자동 집계돼요.'}
              </small>
            </div>
            <div>
              <span>가장 비싼 하루</span>
              <strong>{monthlyInsight.priciestDayLabel}</strong>
              <small>
                {monthlyInsight.priciestDayAmount > 0
                  ? formatCurrency(monthlyInsight.priciestDayAmount)
                  : '아직 월간 피크가 없어요.'}
              </small>
            </div>
            <div>
              <span>스토리 장면</span>
              <strong>{monthlyInsight.logCount}개</strong>
              <small>사진/영상 {monthlyInsight.photoCount}개 포함</small>
            </div>
          </div>
        </article>

        <aside className="badge-board" aria-label="스트릭과 배지">
          <div className="badge-board-top">
            <div>
              <p className="eyebrow">Level & Streak</p>
              <h2>{recordStreak}일 스트릭</h2>
            </div>
            <span>Lv.{level}</span>
          </div>
          <p className="badge-board-copy">
            누적 {recordedDateCount}일 기록했어요. {buddy.shortName}가 다음 리캡까지 이어서 챙겨볼게요.
          </p>
          <div className="streak-meter" aria-label={`배지 ${unlockedBadgeCount}개 획득`}>
            <span style={{ width: `${(unlockedBadgeCount / badgeStates.length) * 100}%` }} />
          </div>
          <div className="badge-grid">
            {badgeStates.map((badge) => (
              <article
                className={`badge-chip ${badge.unlocked ? 'unlocked' : 'locked'}`}
                key={badge.id}
              >
                <strong>{badge.label}</strong>
                <small>{badge.detail}</small>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-grid">
        <div className="calendar-card">
          <div className="section-heading section-heading-toolbar">
            <div>
              <p className="eyebrow">Calendar</p>
              <h2>
                {visibleMonth.year}년 {visibleMonth.month + 1}월
              </h2>
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => moveVisibleMonth(-1)}
                title="이전 달"
              >
                이전 달
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => moveVisibleMonth(1)}
                title="다음 달"
              >
                다음 달
              </button>
              <button
                type="button"
                className="ghost-button story-launch-btn"
                onClick={() => openStory('month')}
                title="이번 달 기록 재생"
              >
                한 달 스토리
              </button>
            </div>
          </div>
          <div className="weekday-row">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const dayExpenses = getExpensesForDate(expenses, day.isoDate)
              const spent = dayExpenseTotal(dayExpenses)
              const earned = dayIncomeTotal(dayExpenses)
              const hasPhoto = dayExpenses.some((expense) => expense.source === 'photo')

              return (
                <button
                  type="button"
                  key={day.isoDate}
                  className={[
                    'calendar-day',
                    day.inCurrentMonth ? '' : 'muted',
                    day.isoDate === selectedDate ? 'selected' : '',
                  ].join(' ')}
                  onClick={() => setSelectedDate(day.isoDate)}
                >
                  <span>{day.day}</span>
                  <span className="calendar-day-money">
                    {spent > 0 && <strong>{formatCurrency(spent)}</strong>}
                    {earned > 0 && (
                      <small className="calendar-day-income">수입 {formatCurrency(earned)}</small>
                    )}
                  </span>
                  {hasPhoto && <small className="calendar-day-photo">사진 로그</small>}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="daily-card">
          <div className="section-heading section-heading-toolbar">
            <div>
              <p className="eyebrow">Daily log</p>
              <h2>{selectedDate}</h2>
            </div>
            <button
              type="button"
              className="ghost-button story-launch-btn"
              onClick={() => openStory('day')}
              title="선택한 날의 기록 재생"
            >
              📷 하루 스토리
            </button>
          </div>
          <p className="daily-summary">{dailyLog.summary}</p>

          <div className="timeline">
            {selectedExpenses.length === 0 ? (
              <div className="empty-state">아직 기록이 없어요. + 버튼으로 첫 로그를 남겨보세요.</div>
            ) : (
              selectedExpenses.map((expense) => {
                const accent = ledgerAccentColor(expense)
                return (
                  <article
                    className={`expense-card ${expense.kind === 'income' ? 'is-income' : ''}`}
                    key={expense.id}
                  >
                    {expense.imageUrl && (
                      <img src={expense.imageUrl} alt="" className="expense-image" />
                    )}
                    <div>
                      <time
                        dateTime={expense.dateTime}
                        className="timeline-relative"
                      >
                        {formatDayLogRelativeKo(new Date(expense.dateTime))}
                      </time>
                      <div className="expense-title-row">
                        <h3>
                          {expense.kind === 'income' && (
                            <span className="ledger-kind-badge ledger-kind-badge-income">
                              수입
                            </span>
                          )}
                          {expense.title}
                        </h3>
                        <strong className={expense.kind === 'income' ? 'amount-income' : undefined}>
                          {expense.kind === 'income' ? '+' : ''}
                          {formatCurrency(expense.amount)}
                        </strong>
                      </div>
                      <p>
                        <span className="category-label" style={{ color: accent }}>
                          {formatLedgerCategory(expense)}
                        </span>
                        {expense.memo && ` · ${expense.memo}`}
                      </p>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </aside>
      </section>

      {addMode !== 'closed' && (
        <section className="sheet-backdrop" aria-label="기록 추가">
          <div className="add-sheet">
            <div className="sheet-header">
              <div>
                <p className="eyebrow">Add record</p>
                <h2>기록 추가</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  stopCamera()
                  setAddMode('closed')
                }}
              >
                닫기
              </button>
            </div>

            {addMode === 'choice' && (
              <div className="choice-grid">
                <button
                  type="button"
                  className="choice-card"
                  aria-label="카메라로 촬영"
                  onClick={() => setAddMode('photo')}
                >
                  <span>사진</span>
                  <strong>카메라로 기록</strong>
                  <small>사진 중심으로 오늘의 소비를 저장해요.</small>
                </button>
                <button
                  type="button"
                  className="choice-card"
                  aria-label="직접 입력"
                  onClick={openManual}
                >
                  <span>직접</span>
                  <strong>직접 입력</strong>
                  <small>금액과 카테고리만 빠르게 남겨요.</small>
                </button>
              </div>
            )}

            {addMode === 'photo' && (
              <div className="photo-flow">
                <div className="capture-mode-toggle" role="group" aria-label="촬영 유형">
                  <button
                    type="button"
                    className={captureMode === 'photo' ? 'active' : ''}
                    aria-pressed={captureMode === 'photo'}
                    onClick={() => setCaptureMode('photo')}
                  >
                    사진
                  </button>
                  <button
                    type="button"
                    className={captureMode === 'video' ? 'active' : ''}
                    aria-pressed={captureMode === 'video'}
                    onClick={() => setCaptureMode('video')}
                  >
                    영상
                  </button>
                </div>
                {captureMode === 'video' && (
                  <div className="video-preset-panel">
                    <div className="duration-presets" role="group" aria-label="영상 길이">
                      {[2, 5, 10].map((seconds) => (
                        <button
                          key={seconds}
                          type="button"
                          aria-pressed={videoDurationSeconds === seconds}
                          className={videoDurationSeconds === seconds ? 'active' : ''}
                          onClick={() => setVideoDurationSeconds(seconds)}
                        >
                          {seconds}초
                        </button>
                      ))}
                    </div>
                    <p>무음 촬영 · 스토리에서 짧게 재생</p>
                  </div>
                )}
                <div className="photo-source-row camera-only-row" role="group" aria-label="카메라">
                  <button type="button" className="camera-start-button" onClick={startCamera}>
                    {captureMode === 'photo' ? '카메라 열고 촬영' : '영상 촬영 준비'}
                  </button>
                </div>
                <p className="camera-permission-note">
                  <strong>촬영만</strong> 지원합니다. 브라우저에서 카메라 권한을 요청해요 (HTTPS 또는
                  localhost).
                </p>
                {cameraError && <p className="camera-error">{cameraError}</p>}
                {cameraStream && (
                  <div className="camera-live-wrap">
                    <video
                      ref={videoRef}
                      className="camera-live"
                      playsInline
                      muted
                      autoPlay
                    />
                    <div className="camera-actions">
                      <button type="button" className="primary-button" onClick={handleCapturePhoto}>
                        촬영하기
                      </button>
                      <button type="button" className="ghost-button" onClick={stopCamera}>
                        카메라 끄기
                      </button>
                    </div>
                  </div>
                )}
                {photoPreview && !cameraStream && (
                  <img src={photoPreview} alt="" className="preview-image" />
                )}
                {analysis && (
                  <p className="analysis-note">
                    {analysis.engine === 'openai' ? 'Vision' : '목(mock)'} 분석 신뢰도{' '}
                    {Math.round(analysis.confidence * 100)}% · {analysis.rawText}
                  </p>
                )}
                <ExpenseEditor
                  form={form}
                  onChange={updateForm}
                  onLedgerKindChange={handleLedgerKindChange}
                  onSubmit={handleSave}
                />
              </div>
            )}

            {addMode === 'manual' && (
              <ExpenseEditor
                form={form}
                onChange={updateForm}
                onLedgerKindChange={handleLedgerKindChange}
                onSubmit={handleSave}
              />
            )}
          </div>
        </section>
      )}
      {storyMode === 'day' && dayStorySlides.length > 0 && (
        <StoryReel
          key={`story-day-${selectedDate}-${dayStorySlides.map((s) => s.id).join()}`}
          title={`${selectedDate} 기록`}
          aggregateLabel="선택일"
          slides={dayStorySlides}
          onClose={closeStory}
        />
      )}
      {storyMode === 'month' && monthStorySlides.length > 0 && (
        <StoryReel
          key={`story-month-${visibleMonth.year}-${visibleMonth.month}-${monthStorySlides.map((s) => s.id).join()}`}
          title={`${visibleMonth.year}년 ${visibleMonth.month + 1}월 기록`}
          aggregateLabel={`${visibleMonth.year}년 ${visibleMonth.month + 1}월`}
          slides={monthStorySlides}
          onClose={closeStory}
        />
      )}
    </main>
  )
}

function ExpenseEditor({
  form,
  onChange,
  onLedgerKindChange,
  onSubmit,
}: {
  form: ExpenseForm
  onChange: (field: keyof ExpenseForm, value: string | LedgerKind) => void
  onLedgerKindChange: (kind: LedgerKind) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const expenseMeta = getCategoryMeta(form.category as CategoryId)
  const expenseActiveGroup = expenseMeta.group
  const incomeMeta = getIncomeCategoryMeta(form.category as IncomeCategoryId)
  const incomeActiveGroup = incomeMeta.group

  const categoryLegend =
    form.kind === 'expense' ? '지출 카테고리 (편한가계부 분류)' : '수입 카테고리 (편한가계부 분류)'

  const categoryHint =
    form.kind === 'expense'
      ? '편한가계부처럼 대분류를 고른 뒤 소분류를 선택하세요.'
      : '수입은 지출과 다른 카테고리 트리로 정리합니다. 같은 방식으로 골라 주세요.'

  return (
    <form className="expense-form" onSubmit={onSubmit}>
      <fieldset className="ledger-kind-fieldset">
        <legend>종류</legend>
        <div className="ledger-kind-toggle" role="group" aria-label="지출 또는 수입">
          <button
            type="button"
            className={form.kind === 'expense' ? 'active' : ''}
            aria-pressed={form.kind === 'expense'}
            onClick={() => onLedgerKindChange('expense')}
          >
            지출
          </button>
          <button
            type="button"
            className={`kind-income${form.kind === 'income' ? ' active' : ''}`}
            aria-pressed={form.kind === 'income'}
            onClick={() => onLedgerKindChange('income')}
          >
            수입
          </button>
        </div>
      </fieldset>
      <label>
        제목
        <input
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder={
            form.kind === 'income' ? '예: 급여, 캐시백' : '예: 오늘의 카페 기록'
          }
        />
      </label>
      <label>
        금액
        <input
          inputMode="numeric"
          value={form.amount}
          onChange={(event) => onChange('amount', event.target.value)}
          placeholder="0"
        />
      </label>
      <fieldset className="category-fieldset">
        <legend>{categoryLegend}</legend>
        <p className="category-hint">{categoryHint}</p>
        {form.kind === 'expense' ? (
          <>
            <div className="category-groups" role="group" aria-label="대분류">
              {categoryTree.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={
                    group.id === expenseActiveGroup.id ? 'category-pill active' : 'category-pill'
                  }
                  aria-pressed={group.id === expenseActiveGroup.id}
                  aria-label={`대분류: ${group.name}`}
                  onClick={() => onChange('category', group.leaves[0].id)}
                >
                  <span aria-hidden>{group.icon}</span>
                  {group.name}
                </button>
              ))}
            </div>
            <div className="category-leaves" role="group" aria-label="소분류">
              {expenseActiveGroup.leaves.map((leaf) => (
                <button
                  key={leaf.id}
                  type="button"
                  className={
                    leaf.id === form.category ? 'category-leaf active' : 'category-leaf'
                  }
                  aria-pressed={leaf.id === form.category}
                  aria-label={`소분류: ${leaf.name}`}
                  onClick={() => onChange('category', leaf.id)}
                >
                  {leaf.name}
                </button>
              ))}
            </div>
            <p className="category-selected">
              선택: <strong>{formatCategoryLabel(form.category as CategoryId)}</strong>
            </p>
          </>
        ) : (
          <>
            <div className="category-groups" role="group" aria-label="수입 대분류">
              {incomeCategoryTree.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={
                    group.id === incomeActiveGroup.id ? 'category-pill active' : 'category-pill'
                  }
                  aria-pressed={group.id === incomeActiveGroup.id}
                  aria-label={`수입 대분류: ${group.name}`}
                  onClick={() => onChange('category', group.leaves[0].id)}
                >
                  <span aria-hidden>{group.icon}</span>
                  {group.name}
                </button>
              ))}
            </div>
            <div className="category-leaves" role="group" aria-label="수입 소분류">
              {incomeActiveGroup.leaves.map((leaf) => (
                <button
                  key={leaf.id}
                  type="button"
                  className={
                    leaf.id === form.category ? 'category-leaf active' : 'category-leaf'
                  }
                  aria-pressed={leaf.id === form.category}
                  aria-label={`수입 소분류: ${leaf.name}`}
                  onClick={() => onChange('category', leaf.id)}
                >
                  {leaf.name}
                </button>
              ))}
            </div>
            <p className="category-selected">
              선택:{' '}
              <strong>
                {formatIncomeCategoryLabel(form.category as IncomeCategoryId)}
              </strong>
            </p>
          </>
        )}
      </fieldset>
      <label>
        메모
        <textarea
          value={form.memo}
          onChange={(event) => onChange('memo', event.target.value)}
          placeholder="기억하고 싶은 내용을 남겨보세요."
        />
      </label>
      <button type="submit" className="primary-button">
        저장하기
      </button>
    </form>
  )
}

export default App
