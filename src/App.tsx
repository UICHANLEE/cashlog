import {
  type ChangeEvent,
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
  getStoryEntriesForDate,
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
import { CatDoodle, DogDoodle } from './components/Doodles'
import { PetCorner } from './components/PetCorner'
import {
  defaultPetState,
  normalizePetState,
  type OutfitId,
  type PetPaletteId,
  type PetKind,
  type PetState,
} from './domain/pet'
import { createCashlogAuthClient, type CashlogSession } from './services/auth'
import { createCashlogRepository, mergeExpenses } from './services/cashlogRepository'

type AddMode = 'closed' | 'choice' | 'photo' | 'manual'
type StoryMode = null | 'day' | 'month'

type ExpenseForm = {
  title: string
  amount: string
  category: LedgerCategoryId
  memo: string
  kind: LedgerKind
}

const STORAGE_KEY = 'cashlog.expenses'
const PET_STORAGE_KEY = 'cashlog.pet'

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const loadPetState = (): PetState => {
  try {
    const stored = localStorage.getItem(PET_STORAGE_KEY)
    if (!stored) return defaultPetState
    return normalizePetState(JSON.parse(stored) as Partial<PetState>)
  } catch {
    return defaultPetState
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
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [visibleMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [addMode, setAddMode] = useState<AddMode>('closed')
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [photoPreview, setPhotoPreview] = useState('')
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [captureKind, setCaptureKind] = useState<'photo' | 'video'>('photo')
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [videoPreview, setVideoPreview] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const posterFileRef = useRef<File | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [storyMode, setStoryMode] = useState<StoryMode>(null)
  const [relativeMinuteTick, setRelativeMinuteTick] = useState(0)
  const [petState, setPetState] = useState<PetState>(loadPetState)
  const [session, setSession] = useState<CashlogSession | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [syncStatus, setSyncStatus] = useState('Supabase 미연결 · 로컬 저장 중')
  const authClient = useMemo(() => createCashlogAuthClient(), [])
  const repository = useMemo(
    () => createCashlogRepository(authClient.config, session),
    [authClient.config, session],
  )
  const initialSyncedSessionRef = useRef<string | null>(null)

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

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
  }, [])

  const revokeAndClearPreview = useCallback(() => {
    setPhotoPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return ''
    })
    setVideoPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return ''
    })
    setAnalysis(null)
    clearRecordTimer()
    setIsRecording(false)
    setRecordSeconds(0)
    recordedChunksRef.current = []
    posterFileRef.current = null
    mediaRecorderRef.current = null
  }, [clearRecordTimer])

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
    localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(petState))
  }, [petState])

  useEffect(() => {
    if (!authClient.isConfigured) {
      return
    }

    let alive = true
    const loadSession = async () => {
      await Promise.resolve()
      const fromUrl = authClient.consumeSessionFromUrl()
      const stored = fromUrl ?? authClient.loadStoredSession()
      if (!stored) {
        setSyncStatus('로그인 대기 · 로컬 저장 중')
        return
      }
      const hydrated = await authClient.hydrateSession(stored)
      if (!alive) return
      authClient.saveSession(hydrated)
      setSession(hydrated)
      setSyncStatus(hydrated.user ? `${hydrated.user.email} 동기화 준비` : '동기화 준비')
    }

    void loadSession()
    return () => {
      alive = false
    }
  }, [authClient])

  const handleOutfitChange = useCallback((kind: PetKind, outfit: OutfitId) => {
    setPetState((prev) =>
      kind === 'cat' ? { ...prev, catOutfit: outfit } : { ...prev, dogOutfit: outfit },
    )
  }, [])

  const handlePaletteChange = useCallback((kind: PetKind, palette: PetPaletteId) => {
    setPetState((prev) =>
      kind === 'cat' ? { ...prev, catPalette: palette } : { ...prev, dogPalette: palette },
    )
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
      clearRecordTimer()
    }
  }, [stopCamera, clearRecordTimer])

  const selectedExpenses = useMemo(
    () => getExpensesForDate(expenses, selectedDate),
    [expenses, selectedDate],
  )
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

  const syncWithCloud = async () => {
    if (!repository) {
      setSyncStatus(authClient.isConfigured ? '로그인이 필요해요' : 'Supabase 미연결 · 로컬 저장 중')
      return
    }

    setSyncStatus('클라우드와 맞추는 중...')
    try {
      const remote = await repository.listExpenses()
      const merged = mergeExpenses(expenses, remote)
      setExpenses(merged)
      await repository.upsertExpenses(merged)
      setSyncStatus(`${merged.length}개 기록 동기화 완료`)
    } catch (e) {
      setSyncStatus(e instanceof Error ? `동기화 실패: ${e.message.slice(0, 80)}` : '동기화 실패')
    }
  }

  useEffect(() => {
    if (!session?.accessToken || !repository) return
    if (initialSyncedSessionRef.current === session.accessToken) return
    initialSyncedSessionRef.current = session.accessToken
    const runInitialSync = async () => {
      setSyncStatus('클라우드와 맞추는 중...')
      try {
        const remote = await repository.listExpenses()
        setExpenses((current) => {
          const merged = mergeExpenses(current, remote)
          void repository
            .upsertExpenses(merged)
            .then(() => setSyncStatus(`${merged.length}개 기록 동기화 완료`))
            .catch((e: unknown) => {
              setSyncStatus(
                e instanceof Error ? `동기화 실패: ${e.message.slice(0, 80)}` : '동기화 실패',
              )
            })
          return merged
        })
      } catch (e) {
        setSyncStatus(e instanceof Error ? `동기화 실패: ${e.message.slice(0, 80)}` : '동기화 실패')
      }
    }
    void runInitialSync()
  }, [repository, session?.accessToken])

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim()
    if (!email) return

    setAuthMessage('로그인 메일을 보내는 중...')
    try {
      await authClient.signInWithEmail(email)
      setAuthMessage('메일함에서 로그인 링크를 눌러 주세요.')
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : '로그인 요청에 실패했어요.')
    }
  }

  const handleSignOut = () => {
    authClient.signOut()
    setSession(null)
    initialSyncedSessionRef.current = null
    setAuthMessage('로그아웃했어요.')
    setSyncStatus(authClient.isConfigured ? '로그인 대기 · 로컬 저장 중' : 'Supabase 미연결 · 로컬 저장 중')
  }

  const expenseToSlide = useCallback((expense: Expense, mode: 'day' | 'month') => {
    const dt = new Date(expense.dateTime)
    const relLabel =
      mode === 'day' ? formatDayLogRelativeKo(dt) : formatMonthLogRelativeKo(dt)
    const img = expense.imageUrl?.trim()
    const vid = expense.videoUrl?.trim()
    const baseDetail = `${formatLedgerCategory(expense)}${expense.memo ? ` · ${expense.memo}` : ''}`
    return {
      id: expense.id,
      ...(img ? { imageUrl: img } : {}),
      ...(vid ? { videoUrl: vid } : {}),
      headline: expense.title,
      amountLabel: formatCurrency(expense.amount),
      amountWon: expense.amount,
      isIncome: expense.kind === 'income',
      detail: `${relLabel} · ${baseDetail}`,
    } satisfies StorySlide
  }, [])

  const dayStorySlides: StorySlide[] = useMemo(() => {
    void relativeMinuteTick
    return getStoryEntriesForDate(expenses, selectedDate).map((e) => expenseToSlide(e, 'day'))
  }, [expenseToSlide, expenses, relativeMinuteTick, selectedDate])

  const monthStorySlides: StorySlide[] = useMemo(() => {
    void relativeMinuteTick
    return getStoryEntriesForMonth(expenses, yearMonth).map((e) => expenseToSlide(e, 'month'))
  }, [expenseToSlide, expenses, relativeMinuteTick, yearMonth])

  const openChoice = () => {
    stopCamera()
    revokeAndClearPreview()
    setCaptureKind('photo')
    setForm(emptyForm())
    setAddMode('choice')
  }

  const openManual = () => {
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
    const wantAudio = captureKind === 'video'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: wantAudio,
      })
      setCameraStream(stream)
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: wantAudio,
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

  const pickVideoMimeType = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined') return undefined
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ]
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported?.(type)) return type
    }
    return undefined
  }

  const handleStartRecording = () => {
    if (!cameraStream) return
    if (typeof MediaRecorder === 'undefined') {
      setCameraError('이 브라우저에서는 영상 녹화를 지원하지 않아요.')
      return
    }
    setCameraError(null)
    recordedChunksRef.current = []
    posterFileRef.current = null

    let recorder: MediaRecorder
    try {
      const mimeType = pickVideoMimeType()
      recorder = new MediaRecorder(cameraStream, mimeType ? { mimeType } : undefined)
    } catch {
      setCameraError('영상 녹화를 시작할 수 없어요.')
      return
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, {
        type: recorder.mimeType || 'video/webm',
      })
      setVideoPreview((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
      stopCamera()
      const poster = posterFileRef.current
      if (poster) {
        await applyPhotoFile(poster)
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    setIsRecording(true)
    setRecordSeconds(0)
    clearRecordTimer()
    recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
  }

  const handleStopRecording = async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    clearRecordTimer()
    setIsRecording(false)

    const video = videoRef.current
    if (video) {
      const posterBlob = await captureFrameFromVideo(video)
      if (posterBlob) {
        posterFileRef.current = new File([posterBlob], `cashlog-poster-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
      }
    }
    recorder.stop()
  }

  const posterFromVideoFile = (file: File): Promise<File | null> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const el = document.createElement('video')
      el.muted = true
      el.playsInline = true
      el.preload = 'metadata'
      const done = (result: File | null) => {
        URL.revokeObjectURL(url)
        resolve(result)
      }
      el.onloadeddata = () => {
        try {
          el.currentTime = Math.min(0.1, (el.duration || 0.2) / 2)
        } catch {
          void 0
        }
      }
      el.onseeked = async () => {
        const blob = await captureFrameFromVideo(el)
        done(blob ? new File([blob], `cashlog-poster-${Date.now()}.jpg`, { type: 'image/jpeg' }) : null)
      }
      el.onerror = () => done(null)
      el.src = url
    })

  const handleGalleryPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      setCameraError('사진 또는 영상 파일만 올릴 수 있어요.')
      return
    }
    stopCamera()

    if (isVideo) {
      setCameraError(null)
      setVideoPreview((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      const poster = await posterFromVideoFile(file)
      if (poster) {
        await applyPhotoFile(poster)
      } else {
        setForm(emptyForm())
      }
      return
    }

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

    const hasMedia = addMode === 'photo' && Boolean(photoPreview || videoPreview)
    let expense: Expense
    if (hasMedia) {
      const base =
        analysis && photoPreview
          ? {
              ...createExpenseFromAnalysis({ analysis, imageUrl: photoPreview, dateTime }),
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
            }
      expense = {
        ...base,
        ...(photoPreview ? { imageUrl: photoPreview } : {}),
        ...(videoPreview ? { videoUrl: videoPreview } : {}),
      }
    } else {
      expense = createManualExpense({
        title: form.title.trim(),
        amount,
        category: categoryNormalized,
        memo: form.memo.trim(),
        dateTime,
        kind: form.kind,
      })
    }

    setExpenses((current) => [expense, ...current])
    if (repository) {
      repository
        .upsertExpense(expense)
        .then(() => setSyncStatus('새 기록 클라우드 저장 완료'))
        .catch((e: unknown) => {
          setSyncStatus(e instanceof Error ? `클라우드 저장 실패: ${e.message.slice(0, 80)}` : '클라우드 저장 실패')
        })
    }
    stopCamera()
    // 미리보기 URL의 소유권을 저장된 기록으로 넘김 (여기서 revoke 하지 않음)
    setPhotoPreview('')
    setVideoPreview('')
    setAnalysis(null)
    setAddMode('closed')
  }

  const updateForm = (field: keyof ExpenseForm, value: string | LedgerKind) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const closeStory = useCallback(() => setStoryMode(null), [])

  const handleCaptureKindChange = (kind: 'photo' | 'video') => {
    if (kind === captureKind) return
    if (isRecording) return
    stopCamera()
    revokeAndClearPreview()
    setCaptureKind(kind)
  }

  const formatRecordClock = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const handleLedgerKindChange = useCallback((kind: LedgerKind) => {
    setForm((f) => ({
      ...f,
      kind,
      category: kind === 'expense' ? defaultExpenseLeafId : defaultIncomeLeafId,
    }))
  }, [])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Photo first money diary</p>
          <h1>Cashlog</h1>
          <p className="hero-copy">
            찍은 사진 기록만 모아 오늘이나 한 달을 스토리처럼 되감습니다. 수입·지출을 간단히 입력할 수 있어요.
          </p>
          <div className="hero-mascots" aria-hidden="true">
            <CatDoodle className="mascot mascot-cat" />
            <DogDoodle className="mascot mascot-dog" />
            <span className="mascot-caption">오늘도 같이 기록해요!</span>
          </div>
        </div>
        <div className="hero-actions">
          <section className="account-card" aria-label="로그인과 동기화">
            <div>
              <p className="eyebrow">Account sync</p>
              <h2>{session?.user?.email ?? '로컬 모드'}</h2>
              <p>{syncStatus}</p>
            </div>
            {authClient.isConfigured ? (
              session ? (
                <div className="account-actions">
                  <button type="button" className="ghost-button" onClick={syncWithCloud}>
                    지금 동기화
                  </button>
                  <button type="button" className="ghost-button" onClick={handleSignOut}>
                    로그아웃
                  </button>
                </div>
              ) : (
                <form className="account-form" onSubmit={handleSignIn}>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="email@example.com"
                    aria-label="로그인 이메일"
                  />
                  <button type="submit">메일 로그인</button>
                </form>
              )
            ) : (
              <small>VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 넣으면 로그인·DB 동기화가 켜져요.</small>
            )}
            {authMessage && <small className="account-message">{authMessage}</small>}
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
          </div>
          <button type="button" className="primary-button" onClick={openChoice}>
            + 기록 추가
          </button>
        </div>
      </section>

      <PetCorner
        totalRecords={expenses.length}
        petState={petState}
        onOutfitChange={handleOutfitChange}
        onPaletteChange={handlePaletteChange}
      />

      <section className="dashboard-grid">
        <div className="calendar-card">
          <div className="section-heading section-heading-toolbar">
            <div>
              <p className="eyebrow">Calendar</p>
              <h2>
                {visibleMonth.year}년 {visibleMonth.month + 1}월
              </h2>
            </div>
            <button
              type="button"
              className="ghost-button story-launch-btn"
              disabled={monthStorySlides.length === 0}
              onClick={() => setStoryMode('month')}
              title="이번 달 기록 재생"
            >
              📽 한 달 스토리
            </button>
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
              disabled={dayStorySlides.length === 0}
              onClick={() => setStoryMode('day')}
              title="선택한 날의 기록 재생"
            >
              📷 하루 스토리
            </button>
          </div>
          <p className="daily-summary">{dailyLog.summary}</p>

          <div className="timeline">
            {selectedExpenses.length === 0 ? (
              <div className="empty-state">
                <CatDoodle className="empty-mascot" aria-hidden="true" />
                <p>아직 기록이 없어요. + 버튼으로 첫 로그를 남겨보세요.</p>
              </div>
            ) : (
              selectedExpenses.map((expense) => {
                const accent = ledgerAccentColor(expense)
                return (
                  <article
                    className={`expense-card ${expense.kind === 'income' ? 'is-income' : ''}`}
                    key={expense.id}
                  >
                    {expense.videoUrl ? (
                      <video
                        className="expense-image"
                        src={expense.videoUrl}
                        poster={expense.imageUrl}
                        muted
                        loop
                        playsInline
                        autoPlay
                      />
                    ) : expense.imageUrl ? (
                      <img src={expense.imageUrl} alt="" className="expense-image" />
                    ) : null}
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
                  const recorder = mediaRecorderRef.current
                  if (recorder && recorder.state !== 'inactive') {
                    recorder.onstop = null
                    try {
                      recorder.stop()
                    } catch {
                      void 0
                    }
                  }
                  stopCamera()
                  revokeAndClearPreview()
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
                  <strong>바로 카메라 촬영</strong>
                  <small>찍어서 저장하고, 로그에서는 스토리로 모아 보여요.</small>
                </button>
                <button
                  type="button"
                  className="choice-card"
                  aria-label="직접 입력"
                  onClick={openManual}
                >
                  <span>직접</span>
                  <strong>직접 입력</strong>
                  <small>기존 가계부처럼 빠르게 기록해요.</small>
                </button>
              </div>
            )}

            {addMode === 'photo' && (
              <div className="photo-flow">
                <div className="capture-kind-toggle" role="group" aria-label="사진 또는 영상">
                  <button
                    type="button"
                    className={captureKind === 'photo' ? 'active' : ''}
                    aria-pressed={captureKind === 'photo'}
                    onClick={() => handleCaptureKindChange('photo')}
                  >
                    📷 사진
                  </button>
                  <button
                    type="button"
                    className={captureKind === 'video' ? 'active' : ''}
                    aria-pressed={captureKind === 'video'}
                    onClick={() => handleCaptureKindChange('video')}
                  >
                    🎬 영상
                  </button>
                </div>
                <div className="photo-source-row" role="group" aria-label="미디어 가져오기">
                  <button type="button" className="camera-start-button" onClick={startCamera}>
                    {captureKind === 'video' ? '🎥 카메라로 녹화' : '📷 카메라 촬영'}
                  </button>
                  <label className="file-picker file-picker-inline">
                    🖼 갤러리에서 선택
                    <input
                      type="file"
                      accept={captureKind === 'video' ? 'video/*' : 'image/*'}
                      onChange={handleGalleryPick}
                      aria-label="갤러리에서 미디어 선택"
                    />
                  </label>
                </div>
                <p className="camera-permission-note">
                  {captureKind === 'video' ? (
                    <>
                      <strong>영상 녹화</strong>는 카메라·마이크 권한이 필요해요 (HTTPS 또는
                      localhost). 녹화가 끝나면 첫 장면을 표지로 잡아 자동 분석해요.
                    </>
                  ) : (
                    <>
                      <strong>카메라 촬영</strong>은 카메라 권한이 필요해요 (HTTPS 또는 localhost).{' '}
                      <strong>갤러리 선택</strong>은 기기에 저장된 사진을 바로 올릴 수 있어요.
                    </>
                  )}
                </p>
                {cameraError && <p className="camera-error">{cameraError}</p>}
                {cameraStream && (
                  <div className="camera-live-wrap">
                    <video
                      ref={videoRef}
                      className={`camera-live${isRecording ? ' is-recording' : ''}`}
                      playsInline
                      muted
                      autoPlay
                    />
                    {isRecording && (
                      <p className="record-indicator" aria-live="polite">
                        <span className="record-dot" aria-hidden /> 녹화 중 {formatRecordClock(recordSeconds)}
                      </p>
                    )}
                    <div className="camera-actions">
                      {captureKind === 'video' ? (
                        isRecording ? (
                          <button
                            type="button"
                            className="primary-button record-stop"
                            onClick={handleStopRecording}
                          >
                            ■ 녹화 정지
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={handleStartRecording}
                          >
                            ● 녹화 시작
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={handleCapturePhoto}
                        >
                          촬영하기
                        </button>
                      )}
                      {!isRecording && (
                        <button type="button" className="ghost-button" onClick={stopCamera}>
                          카메라 끄기
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {videoPreview && !cameraStream && (
                  <video
                    className="preview-image"
                    src={videoPreview}
                    poster={photoPreview || undefined}
                    controls
                    playsInline
                    muted
                    loop
                    autoPlay
                  />
                )}
                {photoPreview && !videoPreview && !cameraStream && (
                  <img src={photoPreview} alt="" className="preview-image" />
                )}
                {analysis && (
                  <p className="analysis-note">
                    {(analysis.model ?? (analysis.engine === 'openai' ? 'Vision' : '목(mock)'))}
                    {' '}분석 신뢰도 {Math.round(analysis.confidence * 100)}% ·{' '}
                    {analysis.categoryReason ?? analysis.rawText}
                    {analysis.detectedObjects?.length
                      ? ` · 단서: ${analysis.detectedObjects.slice(0, 3).join(', ')}`
                      : ''}
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
