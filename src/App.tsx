import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Image as ImageIcon,
  LocateFixed,
  MapPin,
  PawPrint,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Utensils,
  UserRound,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import './App.css'
import { analyzePhoto } from './ai/analyzePhoto'
import { captureFrameFromVideo } from './camera/captureFromVideo'
import {
  categoryTree,
  compareExpensesChronological,
  type CategoryId,
  createExpenseFromAnalysis,
  createManualExpense,
  type Expense,
  type ExpenseLocation,
  dayExpenseTotal,
  dayIncomeTotal,
  formatCurrency,
  formatLedgerCategory,
  getCalendarDays,
  getStoryEntriesForDate,
  getStoryEntriesForMonth,
  getExpensesForDate,
  getCategoryMeta,
  getIncomeCategoryMeta,
  getMoodOption,
  type IncomeCategoryId,
  incomeCategoryTree,
  type LedgerCategoryId,
  type LedgerKind,
  ledgerAccentColor,
  migrateCategoryId,
  migrateIncomeCategoryId,
  moodOptions,
  normalizeAmountInput,
  normalizeMoodScore,
  type PhotoAnalysis,
  type MoodScore,
} from './domain/cashlog'
import {
  clockFromDate,
  combineLocalDateAndTime,
  dominantDayPart,
  formatExpenseClock,
  groupExpensesByDayPart,
} from './domain/entryContext'
import {
  formatDayLogRelativeKo,
  formatMonthLogRelativeKo,
} from './domain/relativeLabelsKo'
import type { StorySlide } from './story/StoryReel'
import { PetPortrait } from './components/PetPortrait'
import {
  defaultPetState,
  getPetBreedId,
  getPetName,
  getPetOutfitId,
  getPetPaletteId,
  normalizePetState,
  type CatBreedId,
  type DogBreedId,
  type PigBreedId,
  type OutfitId,
  type PetPaletteId,
  type PetKind,
  type PetState,
} from './domain/pet'
import {
  createCashlogAuthClient,
  type CashlogSession,
  type OAuthProvider,
} from './services/auth'
import { createCashlogRepository, mergeExpenses } from './services/cashlogRepository'
import { createCashlogStorage } from './services/supabaseStorage'
import { prepareImageForStorage } from './media/prepareImageForStorage'
import { assertValidImageFile } from './media/imageSignature'
import { getMe as getSecureAccount, logout as secureLogout } from './account/accountApi'
import { createCategoryFeedbackPayload } from './domain/productImage'
import { createLocalMediaStore } from './services/localMediaStore'
import { signalSoftImpact } from './motion/haptics'

const PetCorner = lazy(() =>
  import('./components/PetCorner').then((module) => ({ default: module.PetCorner })),
)
const StoryReel = lazy(() =>
  import('./story/StoryReel').then((module) => ({ default: module.StoryReel })),
)
const UichanAdmin = lazy(() =>
  import('./admin/UichanAdmin').then((module) => ({ default: module.UichanAdmin })),
)

type AddMode = 'closed' | 'choice' | 'photo' | 'manual'
type StoryMode = null | 'day' | 'month'
type AppView = 'diary' | 'calendar' | 'pets'
type AuthMode = 'signIn' | 'signUp' | 'magic'
type LocationStatus = 'idle' | 'loading' | 'ready' | 'error'

const APP_VIEW_ORDER: AppView[] = ['diary', 'calendar', 'pets']

type ExpenseForm = {
  title: string
  amount: string
  category: LedgerCategoryId
  memo: string
  moodScore: MoodScore | null
  kind: LedgerKind
}

type ExpenseFormChange = <K extends keyof ExpenseForm>(
  field: K,
  value: ExpenseForm[K],
) => void

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
      const durableImageUrl = expense.imageUrl && !expense.imageUrl.startsWith('blob:')
        ? expense.imageUrl
        : undefined
      return {
        ...expense,
        imageUrl: durableImageUrl,
        kind,
        category,
        moodScore: normalizeMoodScore(expense.moodScore),
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
  amount: '0',
  category: defaultExpenseLeafId,
  memo: '',
  moodScore: null,
  kind: 'expense',
})

const currentTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const dominantCategoryLabel = (items: Expense[]) => {
  const totals = new Map<string, { amount: number; count: number; label: string }>()
  items
    .filter((expense) => expense.kind === 'expense')
    .forEach((expense) => {
      const key = String(expense.category)
      const current = totals.get(key)
      totals.set(key, {
        amount: (current?.amount ?? 0) + expense.amount,
        count: (current?.count ?? 0) + 1,
        label: formatLedgerCategory(expense),
      })
    })
  return [...totals.values()].sort(
    (a, b) => b.amount - a.amount || b.count - a.count,
  )[0]?.label
}

function CashlogApp() {
  const now = new Date()
  const prefersReducedMotion = useReducedMotion()
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses)
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [visibleMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [addMode, setAddMode] = useState<AddMode>('closed')
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [entryTime, setEntryTime] = useState(() => clockFromDate(new Date()))
  const [locationDraft, setLocationDraft] = useState<ExpenseLocation | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const photoFileRef = useRef<File | null>(null)
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [trainingImageConsent, setTrainingImageConsent] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraAspectRatio, setCameraAspectRatio] = useState(4 / 3)
  const [photoAssistMessage, setPhotoAssistMessage] = useState('')
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
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
  const [activeView, setActiveView] = useState<AppView>('diary')
  const [viewDirection, setViewDirection] = useState(1)
  const [showAccount, setShowAccount] = useState(false)
  const [aiContext, setAiContext] = useState<'friends' | 'solo' | null>(null)
  const [relativeMinuteTick, setRelativeMinuteTick] = useState(0)
  const [petState, setPetState] = useState<PetState>(loadPetState)
  const [session, setSession] = useState<CashlogSession | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('signIn')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [showSocialConsents, setShowSocialConsents] = useState(false)
  const [signupConsents, setSignupConsents] = useState({
    age14: false,
    privacy: false,
    photoAndTime: false,
    location: false,
  })
  const [locationCollectionConsent, setLocationCollectionConsent] = useState(false)
  const [isSavingLocationConsent, setIsSavingLocationConsent] = useState(false)
  const [, setSyncStatus] = useState('Supabase 미연결 · 로컬 저장 중')
  const authClient = useMemo(() => createCashlogAuthClient(), [])
  const localMedia = useMemo(() => createLocalMediaStore(), [])
  const repository = useMemo(
    () => createCashlogRepository(authClient.config, session),
    [authClient.config, session],
  )
  const storage = useMemo(
    () => createCashlogStorage(authClient.config, session),
    [authClient.config, session],
  )
  const initialSyncedSessionRef = useRef<string | null>(null)
  const petCloudReadyRef = useRef(false)
  const localImageUrlsRef = useRef(new Map<string, string>())
  const promotingLocalImagesRef = useRef(new Set<string>())

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
    setPhotoAssistMessage('')
    setIsAnalyzingPhoto(false)
    setTrainingImageConsent(false)
    clearRecordTimer()
    setIsRecording(false)
    setRecordSeconds(0)
    recordedChunksRef.current = []
    photoFileRef.current = null
    posterFileRef.current = null
    mediaRecorderRef.current = null
  }, [clearRecordTimer])

  const resetEntryContext = useCallback((sourceDate = new Date()) => {
    setEntryTime(clockFromDate(sourceDate))
    setLocationDraft(null)
    setLocationStatus('idle')
    setLocationMessage('')
  }, [])

  const requestCurrentLocation = useCallback((automatic = false) => {
    if (!locationCollectionConsent) {
      setLocationDraft(null)
      setLocationStatus('idle')
      setLocationMessage('위치 저장에 동의하지 않아 위치를 사용하지 않아요.')
      return
    }
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationMessage('이 기기에서는 위치를 가져올 수 없어요.')
      return
    }

    setLocationStatus('loading')
    setLocationMessage(
      automatic
        ? '동의한 설정에 따라 사진을 추가한 현재 위치를 확인하는 중...'
        : '현재 위치를 확인하는 중...',
    )
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDraft({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          ...(Number.isFinite(position.coords.accuracy)
            ? { accuracyMeters: Math.round(position.coords.accuracy) }
            : {}),
        })
        setLocationStatus('ready')
        setLocationMessage(
          automatic
            ? '이 사진 기록에 현재 위치를 자동으로 넣었어요.'
            : '이 기록에만 현재 위치를 넣었어요.',
        )
        signalSoftImpact()
      },
      (error) => {
        setLocationDraft(null)
        setLocationStatus('error')
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? '기기 위치 권한이 꺼져 있어요. 위치 없이도 저장할 수 있어요.'
            : '위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
        )
      },
      {
        enableHighAccuracy: false,
        timeout: 8_000,
        maximumAge: 5 * 60_000,
      },
    )
  }, [locationCollectionConsent])

  const applyPhotoFile = useCallback(async (file: File, sourceDate?: Date) => {
    setCameraError(null)
    setPhotoAssistMessage('')
    setTrainingImageConsent(false)
    try {
      await assertValidImageFile(file)
    } catch (error) {
      photoFileRef.current = null
      setCameraError(error instanceof Error ? error.message : '유효한 이미지 파일이 아니에요.')
      setForm(emptyForm())
      return
    }
    photoFileRef.current = file
    const recordedAt =
      sourceDate ??
      (file.lastModified > 0 ? new Date(file.lastModified) : new Date())
    setEntryTime(clockFromDate(recordedAt))
    setPhotoPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setAnalysis(null)
    setIsAnalyzingPhoto(true)
    if (locationCollectionConsent) requestCurrentLocation(true)

    try {
      const nextAnalysis = await analyzePhoto(file)
      setAnalysis(nextAnalysis)
      setForm({
        title: nextAnalysis.suggestedTitle,
        amount: String(nextAnalysis.suggestedAmount),
        category: nextAnalysis.suggestedCategory,
        memo: nextAnalysis.suggestedMemo,
        moodScore: null,
        kind: 'expense',
      })
    } catch (e) {
      void e
      setPhotoAssistMessage('사진은 준비됐어요. 금액과 카테고리를 직접 확인해 주세요.')
      setForm(emptyForm())
    } finally {
      setIsAnalyzingPhoto(false)
    }
  }, [locationCollectionConsent, requestCurrentLocation])

  const handleUseCurrentLocation = useCallback(() => {
    requestCurrentLocation(false)
  }, [requestCurrentLocation])

  const handleClearLocation = useCallback(() => {
    setLocationDraft(null)
    setLocationStatus('idle')
    setLocationMessage('')
    signalSoftImpact()
  }, [])

  const hydrateExpenseImages = useCallback(
    async (items: Expense[]) => {
      return Promise.all(
        items.map(async (item) => {
          if (item.imageStoragePath && storage) {
            try {
              return { ...item, imageUrl: await storage.createSignedUrl(item.imageStoragePath) }
            } catch {
              // The device copy below is a fallback while cloud access recovers.
            }
          }
          if (item.imageLocalKey) {
            try {
              const existingUrl = localImageUrlsRef.current.get(item.id)
              if (existingUrl) return { ...item, imageUrl: existingUrl }
              const image = await localMedia.getImage(item.imageLocalKey)
              if (image) {
                const localUrl = URL.createObjectURL(image)
                localImageUrlsRef.current.set(item.id, localUrl)
                return { ...item, imageUrl: localUrl }
              }
            } catch {
              return { ...item, imageUrl: undefined }
            }
          }
          return item.imageUrl?.startsWith('blob:') ? { ...item, imageUrl: undefined } : item
        }),
      )
    },
    [localMedia, storage],
  )

  useEffect(() => {
    let alive = true
    const restoreLocalPhotos = async () => {
      const hydrated = await hydrateExpenseImages(loadExpenses())
      if (!alive) return
      const byId = new Map(hydrated.map((item) => [item.id, item]))
      setExpenses((current) =>
        current.map((item) => {
          const restored = byId.get(item.id)
          return restored?.imageUrl ? { ...item, imageUrl: restored.imageUrl } : item
        }),
      )
    }
    void restoreLocalPhotos()
    return () => {
      alive = false
    }
  }, [hydrateExpenseImages])

  useEffect(() => () => {
    localImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    localImageUrlsRef.current.clear()
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
    petCloudReadyRef.current = false
  }, [repository])

  useEffect(() => {
    let alive = true
    if (!session) {
      return undefined
    }
    void authClient.getSignupConsents(session)
      .then((consents) => {
        if (alive) setLocationCollectionConsent(consents?.location === true)
      })
      .catch(() => {
        if (alive) setLocationCollectionConsent(false)
      })
    return () => {
      alive = false
    }
  }, [authClient, session])

  useEffect(() => {
    if (!authClient.isConfigured) {
      return
    }

    let alive = true
    const loadSession = async () => {
      try {
        const fromUrl = await authClient.consumeSessionFromUrl()
        let secureSession: CashlogSession | null = null
        if (!fromUrl) {
          try {
            const secure = await getSecureAccount()
            if (secure.accessToken) {
              secureSession = {
                accessToken: secure.accessToken,
                ...(secure.expiresIn ? { expiresAt: Date.now() + secure.expiresIn * 1000 } : {}),
                user: { id: secure.user.id, email: secure.user.email },
              }
            }
          } catch {
            secureSession = null
          }
        }
        const stored = fromUrl ?? secureSession ?? authClient.loadStoredSession()
        if (!stored) {
          setSyncStatus('로그인 대기 · 로컬 저장 중')
          return
        }
        const hydrated = await authClient.hydrateSession(stored)
        const savedOAuthConsent = fromUrl
          ? await authClient.persistPendingOAuthConsent(hydrated)
          : false
        if (!alive) return
        if (!secureSession) authClient.saveSession(hydrated)
        setSession(hydrated)
        if (fromUrl) {
          setShowAccount(true)
          setAuthMessage(
            savedOAuthConsent
              ? '간편 로그인이 완료됐어요. 기록을 계정과 맞출게요.'
              : '메일 인증이 완료됐어요. 계정으로 로그인했습니다.',
          )
        }
        setSyncStatus(hydrated.user?.email ? `${hydrated.user.email} 동기화 준비` : '동기화 준비')
      } catch (error) {
        if (!alive) return
        setShowAccount(true)
        setAuthMessage(error instanceof Error ? error.message : '메일 인증에 실패했어요.')
      }
    }

    void loadSession()
    return () => {
      alive = false
    }
  }, [authClient])

  const handleOutfitChange = useCallback((kind: PetKind, outfit: OutfitId) => {
    setPetState((prev) => {
      if (kind === 'cat') return { ...prev, catOutfit: outfit }
      if (kind === 'dog') return { ...prev, dogOutfit: outfit }
      return { ...prev, pigOutfit: outfit }
    })
  }, [])

  const handlePaletteChange = useCallback((kind: PetKind, palette: PetPaletteId) => {
    setPetState((prev) => {
      if (kind === 'cat') return { ...prev, catPalette: palette }
      if (kind === 'dog') return { ...prev, dogPalette: palette }
      return { ...prev, pigPalette: palette }
    })
  }, [])

  const handlePetKindChange = useCallback((kind: PetKind) => {
    setPetState((prev) => ({ ...prev, selectedKind: kind }))
  }, [])

  const handleBreedChange = useCallback(
    (kind: PetKind, breed: CatBreedId | DogBreedId | PigBreedId) => {
      setPetState((prev) => {
        if (kind === 'cat') {
          return { ...prev, catBreed: breed as CatBreedId, selectedKind: 'cat' }
        }
        if (kind === 'dog') {
          return { ...prev, dogBreed: breed as DogBreedId, selectedKind: 'dog' }
        }
        return { ...prev, pigBreed: breed as PigBreedId, selectedKind: 'pig' }
      })
    },
    [],
  )

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
  const selectedExpenseGroups = useMemo(
    () => groupExpensesByDayPart(selectedExpenses),
    [selectedExpenses],
  )
  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  )
  const yearMonth = useMemo(
    () => `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, '0')}`,
    [visibleMonth.year, visibleMonth.month],
  )
  const selectedPetName = getPetName(petState)
  const selectedDaySpent = dayExpenseTotal(selectedExpenses)
  const selectedDayEarned = dayIncomeTotal(selectedExpenses)
  const selectedDayPhotos = selectedExpenses.filter((expense) => expense.imageUrl).slice(0, 3)
  const selectedDayExpenseMoments = selectedExpenses.filter((expense) => expense.kind === 'expense')
  const recentMoodScore = expenses.find((expense) => expense.moodScore)?.moodScore
  const dominantDayCategory = dominantCategoryLabel(selectedDayExpenseMoments)
  const selectedDateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${selectedDate}T12:00:00`))
  const photoSuggestedCategories = useMemo(() => {
    if (!analysis || form.kind !== 'expense') return []
    return [
      analysis.suggestedCategory,
      ...(analysis.topCategories?.map((candidate) => candidate.category) ?? []),
    ].filter((category, index, list) => list.indexOf(category) === index).slice(0, 3)
  }, [analysis, form.kind])

  const syncWithCloud = async () => {
    if (!repository) {
      setSyncStatus(authClient.isConfigured ? '로그인이 필요해요' : 'Supabase 미연결 · 로컬 저장 중')
      return
    }

    setSyncStatus('클라우드와 맞추는 중...')
    try {
      const remote = await hydrateExpenseImages(await repository.listExpenses())
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
        const remote = await hydrateExpenseImages(await repository.listExpenses())
        const remotePet = await repository.getPetState()
        if (remotePet) {
          setPetState(remotePet)
        } else {
          await repository.upsertPetState(petState)
        }
        petCloudReadyRef.current = true
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
  }, [hydrateExpenseImages, petState, repository, session?.accessToken])

  useEffect(() => {
    if (!repository || !petCloudReadyRef.current) return
    repository
      .upsertPetState(petState)
      .then(() => setSyncStatus(`${selectedPetName} 프로필 동기화 완료`))
      .catch((e: unknown) => {
        setSyncStatus(e instanceof Error ? `펫 동기화 실패: ${e.message.slice(0, 80)}` : '펫 동기화 실패')
      })
  }, [petState, repository, selectedPetName])

  useEffect(() => {
    if (!repository || !storage) return
    const pending = expenses.filter(
      (expense) => expense.imageLocalKey && !expense.imageStoragePath,
    )
    if (pending.length === 0) return

    pending.forEach((expense) => {
      if (!expense.imageLocalKey || promotingLocalImagesRef.current.has(expense.id)) return
      promotingLocalImagesRef.current.add(expense.id)
      void (async () => {
        try {
          const image = await localMedia.getImage(expense.imageLocalKey!)
          if (!image) return
          const file = new File([image], 'cashlog-photo.jpg', {
            type: image.type || 'image/jpeg',
            lastModified: Date.now(),
          })
          const uploaded = await storage.uploadImage(file, expense.id)
          const cloudExpense: Expense = {
            ...expense,
            imageStoragePath: uploaded.path,
            imageUrl: uploaded.signedUrl,
          }
          await repository.upsertExpense(cloudExpense)
          await repository.saveImageMetadata({
            expenseId: expense.id,
            storagePath: uploaded.path,
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            capturedAt: expense.dateTime,
          })
          await localMedia.deleteImage(expense.imageLocalKey!)
          const localUrl = localImageUrlsRef.current.get(expense.id)
          if (localUrl) URL.revokeObjectURL(localUrl)
          localImageUrlsRef.current.delete(expense.id)
          setExpenses((current) =>
            current.map((item) =>
              item.id === expense.id
                ? { ...cloudExpense, imageLocalKey: undefined }
                : item,
            ),
          )
          setSyncStatus('기기 사진을 계정에 안전하게 보관했어요.')
        } catch (error) {
          setSyncStatus(
            error instanceof Error
              ? `사진 동기화 실패: ${error.message.slice(0, 80)}`
              : '사진 동기화에 실패했어요.',
          )
        } finally {
          promotingLocalImagesRef.current.delete(expense.id)
        }
      })()
    })
  }, [expenses, localMedia, repository, storage])

  const completeAuth = async (nextSession: CashlogSession, message: string) => {
    const hydrated = await authClient.hydrateSession(nextSession)
    authClient.saveSession(hydrated)
    setSession(hydrated)
    setAuthPassword('')
    setAuthMessage(message)
    setSyncStatus(hydrated.user?.email ? `${hydrated.user.email} 동기화 준비` : '동기화 준비')
  }

  const handleSocialLogin = (provider: OAuthProvider) => {
    if (!authClient.isConfigured) {
      setAuthMessage('로그인 서비스 연결이 아직 완료되지 않았어요.')
      return
    }
    if (!signupConsents.age14 || !signupConsents.privacy || !signupConsents.photoAndTime) {
      setShowSocialConsents(true)
      setAuthMessage('간편 가입에 필요한 필수 동의를 확인해 주세요.')
      return
    }
    setAuthMessage(`${provider === 'google' ? 'Google' : '카카오'} 로그인으로 이동할게요.`)
    authClient.signInWithOAuth(provider, {
      age14: true,
      privacy: true,
      photoAndTime: true,
      location: signupConsents.location,
    })
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authClient.isConfigured) {
      setAuthMessage('로그인 서비스 연결이 아직 완료되지 않았어요.')
      return
    }
    const email = authEmail.trim()
    if (!email) return
    const password = authPassword.trim()

    if (authMode !== 'magic' && password.length < 6) {
      setAuthMessage('비밀번호는 6자 이상으로 입력해 주세요.')
      return
    }

    setAuthMessage(
      authMode === 'signUp'
        ? '계정을 만드는 중...'
        : authMode === 'magic'
          ? '로그인 메일을 보내는 중...'
          : '로그인 중...',
    )
    try {
      if (authMode === 'magic') {
        await authClient.signInWithEmail(email)
        setAuthMessage('메일함에서 로그인 링크를 눌러 주세요.')
        return
      }
      if (authMode === 'signUp') {
        if (!signupConsents.age14 || !signupConsents.privacy || !signupConsents.photoAndTime) {
          setAuthMessage('필수 동의 항목을 모두 확인해 주세요.')
          return
        }
        const created = await authClient.signUpWithPassword(email, password, {
          age14: true,
          privacy: true,
          photoAndTime: true,
          location: signupConsents.location,
        })
        if (created) {
          await completeAuth(created, '가입 완료! 계정 동기화를 준비했어요.')
        } else {
          setAuthMessage('가입 확인 메일을 보냈어요. 메일에서 인증을 완료해 주세요.')
        }
        return
      }
      const nextSession = await authClient.signInWithPassword(email, password)
      await completeAuth(nextSession, '로그인했어요. 기록을 계정과 맞출게요.')
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : '로그인 요청에 실패했어요.')
    }
  }

  const handleSignOut = () => {
    void secureLogout().catch(() => undefined)
    authClient.signOut()
    setSession(null)
    setLocationCollectionConsent(false)
    initialSyncedSessionRef.current = null
    setAuthMessage('로그아웃했어요.')
    setSyncStatus(authClient.isConfigured ? '로그인 대기 · 로컬 저장 중' : 'Supabase 미연결 · 로컬 저장 중')
  }

  const handleLocationConsentChange = async (allowed: boolean) => {
    if (!session || isSavingLocationConsent) return
    setIsSavingLocationConsent(true)
    setAuthMessage('위치 정보 설정을 저장하는 중...')
    try {
      await authClient.updateLocationConsent(session, allowed)
      setLocationCollectionConsent(allowed)
      if (!allowed) {
        setLocationDraft(null)
        setLocationStatus('idle')
        setLocationMessage('')
      }
      setAuthMessage(
        allowed
          ? '사진을 추가할 때 현재 위치를 자동으로 기록할게요.'
          : '위치 자동 기록을 껐어요. 위치를 요청하거나 저장하지 않아요.',
      )
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '위치 정보 설정을 저장하지 못했어요.')
    } finally {
      setIsSavingLocationConsent(false)
    }
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
    const entries = getStoryEntriesForDate(expenses, selectedDate)
    if (entries.length === 0) return []
    const spent = dayExpenseTotal(entries)
    const earned = dayIncomeTotal(entries)
    const busyPart = dominantDayPart(entries)
    const photoCount = entries.filter((entry) => entry.imageUrl || entry.videoUrl).length
    const locationCount = entries.filter((entry) => entry.location).length
    const summary: StorySlide = {
      id: `day-summary-${selectedDate}`,
      variant: 'summary',
      tone: 'sun',
      eyebrow: 'DAY STORY',
      headline: `${selectedDateLabel}의 하루`,
      amountLabel: `${entries.length}개의 장면`,
      amountWon: 0,
      detail: `${selectedPetName}와 함께 모은 오늘의 소비 장면이에요.`,
      stats: [
        { label: '쓴 돈', value: formatCurrency(spent) },
        {
          label: '많이 쓴 시간',
          value: busyPart ? `${busyPart.icon} ${busyPart.label}` : '아직 없어요',
        },
        {
          label: '기록 단서',
          value: `${photoCount}컷 · 위치 ${locationCount}곳`,
        },
        ...(earned > 0 ? [{ label: '들어온 돈', value: `+${formatCurrency(earned)}` }] : []),
      ],
    }
    return [summary, ...entries.map((entry) => expenseToSlide(entry, 'day'))]
  }, [
    expenseToSlide,
    expenses,
    relativeMinuteTick,
    selectedDate,
    selectedDateLabel,
    selectedPetName,
  ])

  const monthStorySlides: StorySlide[] = useMemo(() => {
    void relativeMinuteTick
    const entries = getStoryEntriesForMonth(expenses, yearMonth)
    if (entries.length === 0) return []
    const expenseEntries = entries.filter((entry) => entry.kind === 'expense')
    const spent = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0)
    const earned = entries
      .filter((entry) => entry.kind === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const topCategory = dominantCategoryLabel(expenseEntries) ?? '아직 분류 중'
    const busyPart = dominantDayPart(expenseEntries)
    const biggest = [...expenseEntries].sort((a, b) => b.amount - a.amount)[0]
    const photoCount = entries.filter((entry) => entry.imageUrl || entry.videoUrl).length
    const locationCount = entries.filter((entry) => entry.location).length
    const highlights = [...entries]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .sort(compareExpensesChronological)
    const monthLabel = `${visibleMonth.year}년 ${visibleMonth.month + 1}월`

    return [
      {
        id: `month-summary-${yearMonth}`,
        variant: 'summary',
        tone: 'coral',
        eyebrow: 'MONTH STORY',
        headline: `${monthLabel}, 이렇게 보냈어요`,
        amountLabel: `${entries.length}개의 장면`,
        amountWon: 0,
        detail: '숫자만 나열하지 않고, 기억에 남는 장면부터 골라봤어요.',
        stats: [
          { label: '이번 달 지출', value: formatCurrency(spent) },
          { label: '사진으로 남김', value: `${photoCount}컷` },
          { label: '위치와 함께', value: `${locationCount}곳` },
          ...(earned > 0 ? [{ label: '이번 달 수입', value: `+${formatCurrency(earned)}` }] : []),
        ],
      },
      {
        id: `month-pattern-${yearMonth}`,
        variant: 'summary',
        tone: 'mint',
        eyebrow: 'MY PATTERN',
        headline: '이번 달의 소비 리듬',
        amountLabel: topCategory,
        amountWon: 0,
        detail: biggest
          ? `가장 큰 장면은 “${biggest.title}” ${formatCurrency(biggest.amount)}이었어요.`
          : '조금 더 기록하면 나만의 패턴이 보여요.',
        stats: [
          { label: '자주 쓴 곳', value: topCategory },
          {
            label: '지출이 모인 때',
            value: busyPart ? `${busyPart.icon} ${busyPart.label}` : '아직 없어요',
          },
          { label: '다시 볼 장면', value: `${highlights.length}개` },
        ],
      },
      ...highlights.map((entry) => expenseToSlide(entry, 'month')),
    ]
  }, [
    expenseToSlide,
    expenses,
    relativeMinuteTick,
    visibleMonth.month,
    visibleMonth.year,
    yearMonth,
  ])

  const openPhotoCapture = async () => {
    signalSoftImpact()
    stopCamera()
    revokeAndClearPreview()
    setCaptureKind('photo')
    setForm(emptyForm())
    resetEntryContext()
    setAiContext(null)
    setAddMode('photo')
    await startCamera()
  }

  const openManual = () => {
    signalSoftImpact()
    stopCamera()
    revokeAndClearPreview()
    setForm(emptyForm())
    resetEntryContext()
    setAddMode('manual')
  }

  const closeAddSheet = useCallback(() => {
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
    resetEntryContext()
    setAddMode('closed')
  }, [resetEntryContext, revokeAndClearPreview, stopCamera])

  useEffect(() => {
    if (addMode === 'closed') return undefined
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAddSheet()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [addMode, closeAddSheet])

  useEffect(() => {
    if (addMode === 'closed') return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [addMode])

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('이 브라우저에서는 카메라를 사용할 수 없어요.')
      return
    }
    setCameraError(null)
    setCameraAspectRatio(4 / 3)
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
    const sourceDate = file.lastModified > 0 ? new Date(file.lastModified) : new Date()
    resetEntryContext(sourceDate)
    setAddMode('photo')
    setAiContext(null)
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
        void applyPhotoFile(poster, sourceDate)
      } else {
        setForm(emptyForm())
      }
      return
    }

    void applyPhotoFile(file)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const amount = Number(form.amount)
    if (!form.title.trim() || Number.isNaN(amount) || amount <= 0) return

    setIsSaving(true)

    const dateTime = combineLocalDateAndTime(selectedDate, entryTime)
    const entryContext = {
      localDate: selectedDate,
      timeZone: currentTimeZone(),
      ...(locationDraft ? { location: locationDraft } : {}),
    }
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
              moodScore: form.moodScore ?? undefined,
              kind: form.kind,
            }
          : {
              ...createManualExpense({
                title: form.title.trim(),
                amount,
                category: categoryNormalized,
                memo: form.memo.trim(),
                moodScore: form.moodScore ?? undefined,
                dateTime,
                kind: form.kind,
              }),
              source: 'photo' as const,
            }
      expense = {
        ...base,
        ...entryContext,
        ...(photoPreview ? { imageUrl: photoPreview } : {}),
        ...(videoPreview ? { videoUrl: videoPreview } : {}),
      }
    } else {
      expense = {
        ...createManualExpense({
          title: form.title.trim(),
          amount,
          category: categoryNormalized,
          memo: form.memo.trim(),
          moodScore: form.moodScore ?? undefined,
          dateTime,
          kind: form.kind,
        }),
        ...entryContext,
      }
    }

    const photoFile = photoFileRef.current
    let preparedImage: Awaited<ReturnType<typeof prepareImageForStorage>> | null = null
    if (photoFile) {
      try {
        preparedImage = await prepareImageForStorage(photoFile)
        const imageLocalKey = await localMedia.saveImage(expense.id, preparedImage.file)
        expense = {
          ...expense,
          imageLocalKey,
          imageUrl: photoPreview,
        }
        if (photoPreview.startsWith('blob:')) {
          localImageUrlsRef.current.set(expense.id, photoPreview)
        }
        if (storage) {
          try {
            const uploaded = await storage.uploadImage(preparedImage.file, expense.id)
            expense = {
              ...expense,
              imageStoragePath: uploaded.path,
              imageUrl: uploaded.signedUrl,
            }
          } catch (error) {
            setSyncStatus(
              error instanceof Error
                ? `사진은 이 기기에 저장했어요. 계정 보관 재시도 대기: ${error.message.slice(0, 60)}`
                : '사진은 이 기기에 저장했고 계정 보관은 다시 시도할게요.',
            )
          }
        } else if (authClient.isConfigured) {
          setSyncStatus('사진은 이 기기에 저장했어요. 로그인하면 계정에도 보관됩니다.')
        }
        setCameraError(null)
      } catch (e) {
        setCameraError(
          e instanceof Error ? `사진을 저장하지 못했어요: ${e.message.slice(0, 80)}` : '사진을 저장하지 못했어요.',
        )
        setIsSaving(false)
        return
      }
    }

    let cloudEntrySaved = false
    if (repository) {
      const feedback =
        hasMedia &&
        analysis &&
        form.kind === 'expense' &&
        createCategoryFeedbackPayload({
          expenseId: expense.id,
          analysis,
          selectedLeafId: migrateCategoryId(String(categoryNormalized)),
          imageRetentionConsent:
            trainingImageConsent && Boolean(expense.imageStoragePath),
          imageObjectKey: expense.imageStoragePath,
        })
      try {
        await repository.upsertExpense(expense)
        cloudEntrySaved = true
        const relatedWrites: Promise<unknown>[] = [
          repository.saveDetectedItems(
            expense.id,
            analysis?.detectedItems ?? [],
            analysis?.model,
          ),
        ]
        if (preparedImage && expense.imageStoragePath) {
          relatedWrites.push(repository.saveImageMetadata({
            expenseId: expense.id,
            storagePath: expense.imageStoragePath,
            originalFilename: photoFile?.name ?? preparedImage.file.name,
            mimeType: preparedImage.file.type,
            sizeBytes: preparedImage.file.size,
            width: preparedImage.width,
            height: preparedImage.height,
            capturedAt: photoFile?.lastModified
              ? new Date(photoFile.lastModified).toISOString()
              : expense.dateTime,
          }))
        }
        if (feedback) relatedWrites.push(repository.saveCategoryFeedback(feedback))
        const relatedResults = await Promise.allSettled(relatedWrites)
        const relatedFailed = relatedResults.some((result) => result.status === 'rejected')
        setSyncStatus(
          relatedFailed
            ? '기록과 사진은 저장했지만 일부 분석 정보는 다음 동기화에서 보완할게요.'
            : '새 기록 클라우드 저장 완료',
        )
      } catch (error) {
        setSyncStatus(
          error instanceof Error
            ? `기기에는 저장했어요. 클라우드 저장 실패: ${error.message.slice(0, 70)}`
            : '기기에는 저장했지만 클라우드 저장에 실패했어요.',
        )
      }
    }

    if (cloudEntrySaved && expense.imageStoragePath && expense.imageLocalKey) {
      try {
        await localMedia.deleteImage(expense.imageLocalKey)
        const localUrl = localImageUrlsRef.current.get(expense.id)
        if (localUrl) URL.revokeObjectURL(localUrl)
        localImageUrlsRef.current.delete(expense.id)
        expense = { ...expense, imageLocalKey: undefined }
      } catch {
        // A stale device copy is harmless and can be cleaned up on a later sync.
      }
    }

    setExpenses((current) => [expense, ...current])
    stopCamera()
    setPhotoPreview('')
    photoFileRef.current = null
    setVideoPreview('')
    setAnalysis(null)
    setTrainingImageConsent(false)
    resetEntryContext()
    setAddMode('closed')
    setIsSaving(false)
  }

  const updateForm: ExpenseFormChange = (field, value) => {
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

  const handleAiContext = (context: 'friends' | 'solo') => {
    setAiContext(context)
    updateForm('memo', context === 'friends' ? '친구와 함께' : '혼자 보낸 시간')
  }

  const navigateToView = useCallback((nextView: AppView) => {
    if (nextView === activeView) return
    const currentIndex = APP_VIEW_ORDER.indexOf(activeView)
    const nextIndex = APP_VIEW_ORDER.indexOf(nextView)
    setViewDirection(nextIndex > currentIndex ? 1 : -1)
    setActiveView(nextView)
    signalSoftImpact()
  }, [activeView])

  const viewVariants = {
    enter: (direction: number) => prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, x: direction * 42, scale: 0.985 },
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (direction: number) => prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, x: direction * -28, scale: 0.992 },
  }
  const canSaveDraft = Boolean(form.title.trim()) && Number(form.amount) > 0
  const hasPhotoMedia = Boolean(photoPreview || videoPreview)
  const isCameraLive = addMode === 'photo' && Boolean(cameraStream)
  const isPhotoReview = addMode === 'photo' && hasPhotoMedia && !cameraStream
  const addSheetClassName = [
    'add-sheet',
    isCameraLive ? 'is-camera-live' : '',
    isPhotoReview ? 'is-photo-review' : '',
  ].filter(Boolean).join(' ')

  return (
    <main className="app-shell timeline-app-shell">
      <header className="timeline-topbar">
        <button
          type="button"
          className={`icon-button account-trigger${showAccount ? ' is-open' : ''}`}
          aria-label={showAccount ? '계정 메뉴 닫기' : '계정 메뉴 열기'}
          onClick={() => setShowAccount((open) => !open)}
        >
          {showAccount ? (
            <X size={22} />
          ) : (
            <>
              <UserRound size={19} aria-hidden />
              <span>{session ? '내 계정' : '로그인'}</span>
            </>
          )}
        </button>
        <strong className="timeline-brand">Cashlog <Pencil size={18} aria-hidden /></strong>
        <button
          type="button"
          className="daily-story-button"
          disabled={dayStorySlides.length === 0}
          onClick={() => setStoryMode('day')}
        >
          <Sparkles size={16} aria-hidden /> 하루 스토리
        </button>
      </header>

      <AnimatePresence initial={false}>
        {showAccount && (
        <motion.section
          className="account-card account-drawer"
          aria-label="로그인과 동기화"
          initial={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -10, scale: 0.98 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -8, scale: 0.985 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.16, ease: [0.23, 1, 0.32, 1] }
              : { type: 'spring', duration: 0.3, bounce: 0 }
          }
        >
          <div>
            <p className="eyebrow">MY CASHLOG</p>
            <h2>{session?.user?.email ?? '내 기록 지키기'}</h2>
            {!session && <p>로그인하면 사진 기록과 캐릭터가 모든 기기에서 이어져요.</p>}
          </div>
          {session ? (
            <>
              <label className="account-location-setting">
                <input
                  type="checkbox"
                  checked={locationCollectionConsent}
                  disabled={isSavingLocationConsent}
                  onChange={(event) => void handleLocationConsentChange(event.target.checked)}
                />
                <span>
                  <strong>사진 위치 자동 기록</strong>
                  <small>켜면 사진을 추가할 때 기기의 현재 위치를 확인해 해당 기록에만 저장해요.</small>
                </span>
              </label>
              <p className="account-privacy-note">
                끄면 위치 권한을 요청하거나 새 위치를 저장하지 않습니다. 언제든 다시 변경할 수 있어요.
              </p>
              <div className="account-actions">
                <button type="button" className="ghost-button" onClick={syncWithCloud}>지금 동기화</button>
                <a className="ghost-button" href="/profile.html">프로필 관리</a>
                <button type="button" className="ghost-button" onClick={handleSignOut}>로그아웃</button>
              </div>
            </>
            ) : (
              <form className="account-form" onSubmit={handleAuthSubmit}>
                <div className="social-login-buttons" aria-label="간편 로그인">
                  <button type="button" className="social-login google" onClick={() => handleSocialLogin('google')}>
                    <span className="social-mark google-mark" aria-hidden>G</span>
                    Google로 계속하기
                  </button>
                  <button type="button" className="social-login kakao" onClick={() => handleSocialLogin('kakao')}>
                    <span className="social-mark kakao-mark" aria-hidden>톡</span>
                    카카오로 계속하기
                  </button>
                </div>
                {showSocialConsents && authMode !== 'signUp' && (
                  <fieldset className="signup-consents social-consents">
                    <legend>간편 가입 동의</legend>
                    <label>
                      <input type="checkbox" checked={signupConsents.age14} onChange={(event) => setSignupConsents((current) => ({ ...current, age14: event.target.checked }))} />
                      <span><strong>[필수]</strong> 만 14세 이상입니다.</span>
                    </label>
                    <label>
                      <input type="checkbox" checked={signupConsents.privacy} onChange={(event) => setSignupConsents((current) => ({ ...current, privacy: event.target.checked }))} />
                      <span><strong>[필수]</strong> <a href="/privacy.html" target="_blank">개인정보 처리방침</a>에 동의합니다.</span>
                    </label>
                    <label>
                      <input type="checkbox" checked={signupConsents.photoAndTime} onChange={(event) => setSignupConsents((current) => ({ ...current, photoAndTime: event.target.checked }))} />
                      <span><strong>[필수]</strong> 선택한 사진과 사진 파일·기록 시각의 비공개 저장 및 카테고리 추천에 동의합니다.</span>
                    </label>
                    <label>
                      <input type="checkbox" checked={signupConsents.location} onChange={(event) => setSignupConsents((current) => ({ ...current, location: event.target.checked }))} />
                      <span><strong>[선택]</strong> 사진을 추가할 때 기기의 현재 위치를 자동으로 확인해 해당 기록에 저장하는 데 동의합니다.</span>
                    </label>
                    <p className="consent-protection">선택하지 않으면 위치 권한을 요청하거나 위치를 수집하지 않습니다. 사진과 위치는 다른 사용자에게 공개하거나 판매하지 않으며, 동의는 언제든 철회할 수 있습니다.</p>
                  </fieldset>
                )}
                <div className="account-divider"><span>또는 이메일로</span></div>
                <div className="account-mode-tabs" role="group" aria-label="로그인 방식">
                  <button type="button" className={authMode === 'signIn' ? 'active' : ''} onClick={() => setAuthMode('signIn')}>로그인</button>
                  <button type="button" className={authMode === 'signUp' ? 'active' : ''} onClick={() => setAuthMode('signUp')}>회원가입</button>
                  <button type="button" className={authMode === 'magic' ? 'active' : ''} onClick={() => setAuthMode('magic')}>메일링크</button>
                </div>
                <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="email@example.com" aria-label="로그인 이메일" autoComplete="email" />
                {authMode !== 'magic' && (
                  <input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="비밀번호 6자 이상" aria-label="로그인 비밀번호" autoComplete={authMode === 'signUp' ? 'new-password' : 'current-password'} />
                )}
                {authMode === 'signUp' && (
                  <fieldset className="signup-consents">
                    <legend>가입 및 개인정보 동의</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.age14}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, age14: event.target.checked }))}
                      />
                      <span><strong>[필수]</strong> 만 14세 이상입니다.</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.privacy}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, privacy: event.target.checked }))}
                      />
                      <span><strong>[필수]</strong> <a href="/privacy.html" target="_blank">개인정보 처리방침</a>에 동의합니다.</span>
                    </label>
                    <details>
                      <summary>개인정보 수집 내용</summary>
                      <p>이메일, 계정 식별자, 소비 기록을 가입·동기화·서비스 제공 목적으로만 처리합니다. 내 정보는 다른 사용자에게 공개하거나 판매하지 않으며, 열람·정정·삭제·처리정지·동의 철회를 요청할 수 있습니다.</p>
                    </details>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.photoAndTime}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, photoAndTime: event.target.checked }))}
                      />
                      <span><strong>[필수]</strong> 선택한 사진과 사진 파일·기록 시각의 비공개 저장 및 카테고리 추천에 동의합니다.</span>
                    </label>
                    <details>
                      <summary>사진·시간 처리와 보호 내용</summary>
                      <p>사진은 용량을 줄이고 EXIF를 제거한 비공개 보관본으로 저장됩니다. 사진 파일의 수정 시각 또는 사용자가 정한 기록 시각은 하루·한 달 스토리에 사용되며, 다른 사용자는 볼 수 없습니다.</p>
                    </details>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.location}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, location: event.target.checked }))}
                      />
                      <span><strong>[선택]</strong> 사진을 추가할 때 기기의 현재 위치를 자동으로 확인해 해당 기록에 저장하는 데 동의합니다.</span>
                    </label>
                    <p className="consent-note consent-protection">선택하지 않으면 위치 권한을 요청하거나 위치를 수집·전송·저장하지 않습니다. 동의해도 기기 권한을 별도로 허용해야 하며, 계정 메뉴에서 언제든 철회할 수 있습니다.</p>
                  </fieldset>
                )}
                <button type="submit">{authMode === 'signUp' ? '가입하고 시작' : authMode === 'magic' ? '메일 링크 받기' : '로그인'}</button>
              </form>
            )}
          {authMessage && <small className="account-message">{authMessage}</small>}
        </motion.section>
        )}
      </AnimatePresence>

      <motion.div
        className="app-view-viewport"
        animate={
          addMode === 'closed'
            ? { scale: 1, y: 0, opacity: 1 }
            : prefersReducedMotion
              ? { opacity: 0.94 }
              : { scale: 0.985, y: -6, opacity: 0.92 }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.14 }
            : { type: 'spring', duration: 0.34, bounce: 0 }
        }
      >
        <AnimatePresence initial={false} custom={viewDirection} mode="popLayout">
          <motion.div
            key={activeView}
            className="app-view-screen"
            custom={viewDirection}
            variants={viewVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              prefersReducedMotion
                ? { duration: 0.14, ease: [0.23, 1, 0.32, 1] }
                : { type: 'spring', duration: 0.42, bounce: 0 }
            }
          >
      {activeView === 'pets' ? (
        <Suspense
          fallback={(
            <section className="lazy-pet-view" role="status" aria-label="캐릭터 공간 불러오는 중">
              <PetPortrait
                kind={petState.selectedKind}
                name={selectedPetName}
                outfit={getPetOutfitId(petState)}
                breed={getPetBreedId(petState)}
                palette={getPetPaletteId(petState)}
              />
            </section>
          )}
        >
          <PetCorner
            totalRecords={expenses.length}
            petState={petState}
            recentMoodScore={recentMoodScore}
            onKindChange={handlePetKindChange}
            onBreedChange={handleBreedChange}
            onOutfitChange={handleOutfitChange}
            onPaletteChange={handlePaletteChange}
          />
        </Suspense>
      ) : activeView === 'calendar' ? (
        <section className="calendar-view">
          <div className="calendar-card">
            <div className="section-heading section-heading-toolbar">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2>
                  {visibleMonth.year}년 {visibleMonth.month + 1}월
                </h2>
              </div>
              <div className="calendar-companion" aria-label="캘린더 친구">
                <PetPortrait
                  kind={petState.selectedKind}
                  name={selectedPetName}
                  breed={getPetBreedId(petState)}
                  palette={getPetPaletteId(petState)}
                  className="mini-companion"
                />
              </div>
              <button
                type="button"
                className="ghost-button story-launch-btn"
                disabled={monthStorySlides.length === 0}
                onClick={() => setStoryMode('month')}
                title="이번 달 기록 재생"
              >
                한 달 스토리
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
        </section>
      ) : (
        <section className="timeline-home">
          <header className="today-heading">
            <div>
              <p className="eyebrow">TODAY</p>
              <button type="button" className="date-switcher" onClick={() => navigateToView('calendar')}>
                {selectedDateLabel} <ChevronDown size={20} aria-hidden />
              </button>
            </div>
            <div className="today-cuts" aria-label={`오늘 사진 ${selectedDayPhotos.length}장`}>
              <strong>오늘 {selectedDayPhotos.length}컷</strong>
              <div className="today-cut-strip">
                {selectedDayPhotos.map((expense) => (
                  <img key={expense.id} src={expense.imageUrl} alt="오늘 기록" />
                ))}
                {selectedDayPhotos.length === 0 && (
                  <button type="button" onClick={openPhotoCapture} aria-label="오늘 첫 사진 촬영">
                    <Camera size={18} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="today-money-strip">
            <span>오늘 남긴 장면 <strong>{selectedExpenses.length}개</strong></span>
            {dominantDayCategory && <span>자주 등장한 순간 <strong>{dominantDayCategory}</strong></span>}
            <span className="today-total-money">총 지출 {formatCurrency(selectedDaySpent)}</span>
            {selectedDayEarned > 0 && <span className="today-income">수입 +{formatCurrency(selectedDayEarned)}</span>}
          </div>

          <div className="timeline-companion">
            <PetPortrait
              kind={petState.selectedKind}
              name={selectedPetName}
              breed={getPetBreedId(petState)}
              palette={getPetPaletteId(petState)}
              className="timeline-pet"
            />
            <p>
              <strong>{selectedPetName}</strong>가{' '}
              {selectedExpenses.length > 0
                ? `${selectedExpenses.length}개의 장면을 한 편의 하루로 묶고 있어요.`
                : '오늘의 첫 장면을 기다리고 있어요.'}
            </p>
          </div>

          <div className="photo-timeline">
            {selectedExpenses.length === 0 ? (
              <div className="timeline-empty-moment">
                <div className="timeline-empty-photo">
                  <img src="/cafe-receipt-moment.png" alt="아이스 아메리카노와 영수증 기록 예시" />
                  <span><Camera size={14} aria-hidden /> 사진 기록 예시</span>
                </div>
                <div>
                  <p className="empty-question">오늘 첫 장면, 나랑 찍어볼까?</p>
                  <button type="button" className="empty-camera-link" onClick={openPhotoCapture}>
                    <Camera size={18} aria-hidden /> 사진으로 시작
                  </button>
                </div>
              </div>
            ) : (
              selectedExpenseGroups.map((group) => (
                <section className="timeline-daypart" key={group.part.id}>
                  <header className="timeline-daypart-heading">
                    <div>
                      <span aria-hidden>{group.part.icon}</span>
                      <strong>{group.part.label}</strong>
                      <small>{group.part.rangeLabel}</small>
                    </div>
                    <p>
                      {group.expenses.length}개 · {formatCurrency(group.spent)}
                      {group.earned > 0 ? ` · +${formatCurrency(group.earned)}` : ''}
                    </p>
                  </header>
                  <div className="timeline-daypart-entries">
                    {group.expenses.map((expense) => (
                      <TimelineExpenseEntry key={expense.id} expense={expense} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <div className="capture-prompt">찍으면 내가 정리해줄게!</div>
          <div className="capture-dock" aria-label="빠른 기록">
            <label className="dock-secondary" title="사진 보관함">
              <ImageIcon size={23} aria-hidden />
              <span>사진</span>
              <input type="file" accept="image/*" onChange={handleGalleryPick} aria-label="갤러리에서 사진 선택" />
            </label>
            <button type="button" className="camera-shutter" onClick={openPhotoCapture} aria-label="카메라로 바로 촬영">
              <Camera size={34} strokeWidth={2.2} aria-hidden />
            </button>
            <button type="button" className="dock-secondary" onClick={openManual} aria-label="빠른 직접 입력">
              <Pencil size={23} aria-hidden />
              <span>입력</span>
            </button>
          </div>
          <button type="button" className="sr-only-action" onClick={openManual}>+ 기록 추가</button>
        </section>
      )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <nav className="bottom-nav" aria-label="주요 화면">
        <motion.button
          type="button"
          className={activeView === 'diary' ? 'active' : ''}
          aria-label="하루 타임라인"
          aria-pressed={activeView === 'diary'}
          onClick={() => navigateToView('diary')}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
        >
          {activeView === 'diary' && <motion.span className="bottom-nav-selection" layoutId="bottom-nav-selection" transition={{ type: 'spring', duration: 0.32, bounce: 0.06 }} aria-hidden="true" />}
          <span className="bottom-nav-content"><BarChart3 size={21} aria-hidden /><span>기록</span></span>
        </motion.button>
        <motion.button
          type="button"
          className={activeView === 'calendar' ? 'active' : ''}
          aria-label="달력"
          aria-pressed={activeView === 'calendar'}
          onClick={() => navigateToView('calendar')}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
        >
          {activeView === 'calendar' && <motion.span className="bottom-nav-selection" layoutId="bottom-nav-selection" transition={{ type: 'spring', duration: 0.32, bounce: 0.06 }} aria-hidden="true" />}
          <span className="bottom-nav-content"><CalendarDays size={21} aria-hidden /><span>달력</span></span>
        </motion.button>
        <motion.button
          type="button"
          className={activeView === 'pets' ? 'active' : ''}
          aria-label={selectedPetName}
          aria-pressed={activeView === 'pets'}
          onClick={() => navigateToView('pets')}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
        >
          {activeView === 'pets' && <motion.span className="bottom-nav-selection" layoutId="bottom-nav-selection" transition={{ type: 'spring', duration: 0.32, bounce: 0.06 }} aria-hidden="true" />}
          <span className="bottom-nav-content"><PawPrint size={21} aria-hidden /><span>{selectedPetName}</span></span>
        </motion.button>
      </nav>

      <motion.section
          className={`sheet-backdrop${addMode !== 'closed' ? ' is-open' : ''}`}
          role={addMode !== 'closed' ? 'dialog' : undefined}
          aria-modal={addMode !== 'closed' ? 'true' : undefined}
          aria-label={addMode !== 'closed' ? '기록 추가' : undefined}
          aria-hidden={addMode === 'closed'}
          initial={false}
          animate={{ opacity: addMode !== 'closed' ? 1 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.16 : 0.2, ease: [0.23, 1, 0.32, 1] }}
          onPointerDown={(event) => {
            if (addMode !== 'closed' && event.target === event.currentTarget) closeAddSheet()
          }}
        >
          <motion.div
            className={addSheetClassName}
            initial={false}
            animate={
              addMode !== 'closed'
                ? { opacity: 1, y: 0, scale: 1 }
                : prefersReducedMotion
                  ? { opacity: 0, y: 0, scale: 1 }
                  : { opacity: 0, y: 28, scale: 0.98 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.16, ease: [0.23, 1, 0.32, 1] }
                : { type: 'spring', duration: 0.4, bounce: 0.12 }
            }
          >
            {addMode !== 'closed' && (
            <>
            <div className="sheet-header">
              <div>
                <p className="eyebrow">{addMode === 'manual' ? 'QUICK LOG' : 'PHOTO LOG'}</p>
                <h2>
                  {isCameraLive
                    ? '장면 촬영'
                    : isPhotoReview
                      ? '찍은 장면 확인'
                      : addMode === 'photo'
                        ? '사진으로 기록'
                        : '빠른 기록'}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="기록 창 닫기"
                onClick={closeAddSheet}
              >
                <X size={22} aria-hidden />
              </button>
            </div>

            <div className="add-sheet-scroll">
            {addMode === 'choice' && (
              <div className="choice-grid">
                <button
                  type="button"
                  className="choice-card"
                  aria-label="카메라로 촬영"
                  onClick={() => setAddMode('photo')}
                >
                  <Camera size={26} aria-hidden />
                  <strong>바로 카메라 촬영</strong>
                  <small>찍어서 저장하고, 로그에서는 스토리로 모아 보여요.</small>
                </button>
                <button
                  type="button"
                  className="choice-card"
                  aria-label="직접 입력"
                  onClick={openManual}
                >
                  <Pencil size={26} aria-hidden />
                  <strong>직접 입력</strong>
                  <small>기존 가계부처럼 빠르게 기록해요.</small>
                </button>
              </div>
            )}

            {addMode === 'photo' && (
              <div className="photo-flow">
                {!photoPreview && !videoPreview && !cameraStream && (
                  <div className="media-source-step">
                    <div className="capture-kind-toggle" role="group" aria-label="사진 또는 영상">
                      <button
                        type="button"
                        className={captureKind === 'photo' ? 'active' : ''}
                        aria-pressed={captureKind === 'photo'}
                        onClick={() => handleCaptureKindChange('photo')}
                      >
                        <Camera size={17} aria-hidden /> 사진
                      </button>
                      <button
                        type="button"
                        className={captureKind === 'video' ? 'active' : ''}
                        aria-pressed={captureKind === 'video'}
                        onClick={() => handleCaptureKindChange('video')}
                      >
                        영상
                      </button>
                    </div>
                    <div className="photo-source-row" role="group" aria-label="미디어 가져오기">
                      <button type="button" className="camera-start-button" onClick={startCamera}>
                        <Camera size={20} aria-hidden />
                        {captureKind === 'video' ? '카메라로 녹화' : '카메라 촬영'}
                      </button>
                      <label className="file-picker file-picker-inline">
                        <ImageIcon size={20} aria-hidden /> 갤러리에서 선택
                        <input
                          type="file"
                          accept={captureKind === 'video' ? 'video/*' : 'image/*'}
                          onChange={handleGalleryPick}
                          aria-label="갤러리에서 미디어 선택"
                        />
                      </label>
                    </div>
                    <p className="camera-permission-note">
                      {captureKind === 'video'
                        ? '녹화를 시작할 때 카메라와 마이크 권한을 확인해요.'
                        : '촬영할 때만 카메라 권한을 확인해요. 갤러리 사진도 바로 쓸 수 있어요.'}
                    </p>
                  </div>
                )}
                {cameraError && <p className="camera-error">{cameraError}</p>}
                {cameraStream && (
                  <div className="camera-live-wrap">
                    <div
                      className={`camera-live-frame${isRecording ? ' is-recording' : ''}`}
                      style={{ aspectRatio: cameraAspectRatio }}
                    >
                      <video
                        ref={videoRef}
                        className="camera-live"
                        playsInline
                        muted
                        autoPlay
                        aria-label="카메라 전체 화면 미리보기"
                        onLoadedMetadata={(event) => {
                          const { videoWidth, videoHeight } = event.currentTarget
                          if (!videoWidth || !videoHeight) return
                          setCameraAspectRatio(
                            Math.min(2.4, Math.max(0.4, videoWidth / videoHeight)),
                          )
                        }}
                      />
                    </div>
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
                {(photoPreview || videoPreview) && !cameraStream && (
                  <div className="media-review-card">
                    {videoPreview ? (
                      <video
                        className="preview-image"
                        src={videoPreview}
                        poster={photoPreview || undefined}
                        playsInline
                        muted
                        loop
                        autoPlay
                      />
                    ) : (
                      <img src={photoPreview} alt="선택한 기록 사진" className="preview-image" />
                    )}
                    <div className="media-review-copy">
                      <span>장면 준비 완료</span>
                      <strong>아래 내용만 확인하면 저장돼요</strong>
                      <div className="media-review-actions">
                        <label>
                          <ImageIcon size={15} aria-hidden /> 바꾸기
                          <input
                            type="file"
                            accept={captureKind === 'video' ? 'video/*' : 'image/*'}
                            onChange={handleGalleryPick}
                            aria-label="다른 미디어 선택"
                          />
                        </label>
                        <button type="button" onClick={startCamera}>
                          <Camera size={15} aria-hidden /> 다시 촬영
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {isAnalyzingPhoto && (
                  <p className="photo-assist-hint is-loading" role="status">
                    <span aria-hidden /> 사진에서 기록할 내용을 정리하는 중...
                  </p>
                )}
                {photoAssistMessage && (
                  <p className="photo-assist-hint" role="status">
                    <Check size={15} aria-hidden /> {photoAssistMessage}
                  </p>
                )}
                {analysis && (
                  <div className="analysis-note analysis-note-compact">
                    <span className="analysis-status"><Check size={15} aria-hidden /> 사진에서 먼저 정리했어요</span>
                    <p>{analysis.categoryReason ?? analysis.rawText}</p>
                    {analysis.detectedItems?.length ? (
                      <div className="shopping-moment-summary">
                        <strong>{analysis.detectedItems.length}개 상품을 한 장면으로 묶었어요</strong>
                        <div className="detected-item-list" aria-label="탐지 상품 목록">
                          {analysis.detectedItems.slice(0, 8).map((item) => (
                            <span key={`${item.name}-${item.category}`}>{item.displayName}</span>
                          ))}
                          {analysis.detectedItems.length > 8 && <span>+{analysis.detectedItems.length - 8}개</span>}
                        </div>
                      </div>
                    ) : analysis.detectedObjects?.length ? (
                      <small>단서: {analysis.detectedObjects.slice(0, 3).join(', ')}</small>
                    ) : null}
                    <div className="pet-context-question pet-context-question-compact">
                      <PetPortrait
                        kind={petState.selectedKind}
                        name={selectedPetName}
                        breed={getPetBreedId(petState)}
                        palette={getPetPaletteId(petState)}
                        className="question-pet"
                      />
                      <div>
                        <strong>친구랑 함께한 장면이야?</strong>
                        <div role="group" aria-label="사진 속 상황">
                          <button type="button" className={aiContext === 'friends' ? 'active' : ''} onClick={() => handleAiContext('friends')}>응</button>
                          <button type="button" className={aiContext === 'solo' ? 'active' : ''} onClick={() => handleAiContext('solo')}>혼자</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {hasPhotoMedia && !cameraStream && (
                  <ExpenseEditor
                    formId="cashlog-photo-form"
                    form={form}
                    onChange={updateForm}
                    onLedgerKindChange={handleLedgerKindChange}
                    onSubmit={handleSave}
                    isSaving={isSaving}
                    assistantMode
                    detectedItemCount={analysis?.detectedItems?.length ?? 0}
                    petName={selectedPetName}
                    suggestedCategories={photoSuggestedCategories}
                    entryTime={entryTime}
                    onEntryTimeChange={setEntryTime}
                    location={locationDraft}
                    locationAllowed={locationCollectionConsent}
                    locationStatus={locationStatus}
                    locationMessage={locationMessage}
                    onRequestLocation={handleUseCurrentLocation}
                    onClearLocation={handleClearLocation}
                  />
                )}
              </div>
            )}

            {addMode === 'manual' && (
              <ExpenseEditor
                formId="cashlog-manual-form"
                form={form}
                onChange={updateForm}
                onLedgerKindChange={handleLedgerKindChange}
                onSubmit={handleSave}
                isSaving={isSaving}
                entryTime={entryTime}
                onEntryTimeChange={setEntryTime}
                location={locationDraft}
                locationAllowed={locationCollectionConsent}
                locationStatus={locationStatus}
                locationMessage={locationMessage}
                onRequestLocation={handleUseCurrentLocation}
                onClearLocation={handleClearLocation}
              />
            )}
            </div>
            {(isPhotoReview || addMode === 'manual') && (
              <div className="sheet-action-footer">
                <button
                  type="submit"
                  form={addMode === 'photo' ? 'cashlog-photo-form' : 'cashlog-manual-form'}
                  className="primary-button"
                  disabled={isSaving || !canSaveDraft}
                >
                  {isSaving
                    ? addMode === 'photo'
                      ? '사진 보관 중...'
                      : '저장 중...'
                    : addMode === 'photo'
                      ? '이 장면으로 저장'
                      : '저장하기'}
                </button>
              </div>
            )}
            </>
            )}
          </motion.div>
        </motion.section>
      <footer className="legal-footer">
        <a href="/privacy.html">개인정보처리방침</a>
        <a href="https://github.com/UICHANLEE/cashlog">GitHub</a>
      </footer>
      {storyMode === 'day' && dayStorySlides.length > 0 && (
        <Suspense fallback={null}>
          <StoryReel
            key={`story-day-${selectedDate}-${dayStorySlides.map((s) => s.id).join()}`}
            title={`${selectedDateLabel} 스토리`}
            aggregateLabel="오늘"
            slides={dayStorySlides}
            onClose={closeStory}
          />
        </Suspense>
      )}
      {storyMode === 'month' && monthStorySlides.length > 0 && (
        <Suspense fallback={null}>
          <StoryReel
            key={`story-month-${visibleMonth.year}-${visibleMonth.month}-${monthStorySlides.map((s) => s.id).join()}`}
            title={`${visibleMonth.year}년 ${visibleMonth.month + 1}월 기록`}
            aggregateLabel={`${visibleMonth.year}년 ${visibleMonth.month + 1}월`}
            slides={monthStorySlides}
            onClose={closeStory}
          />
        </Suspense>
      )}
    </main>
  )
}

function TimelineExpenseEntry({ expense }: { expense: Expense }) {
  const accent = ledgerAccentColor(expense)
  const isPhoto = Boolean(expense.imageUrl || expense.videoUrl)
  const locationTitle = expense.location
    ? `${expense.location.latitude.toFixed(4)}, ${expense.location.longitude.toFixed(4)}`
    : undefined

  return (
    <article className={`timeline-entry${isPhoto ? ' timeline-entry-photo' : ''}`}>
      <time dateTime={expense.dateTime}>
        {formatExpenseClock(expense.dateTime, expense.timeZone)}
      </time>
      <span className="timeline-node" style={{ backgroundColor: accent }} aria-hidden>
        {isPhoto ? (
          <Camera size={18} />
        ) : expense.kind === 'income' ? (
          <Sparkles size={18} />
        ) : (
          <Utensils size={18} />
        )}
      </span>
      <div className="timeline-entry-body">
        {expense.videoUrl ? (
          <video
            className="timeline-photo"
            src={expense.videoUrl}
            poster={expense.imageUrl}
            muted
            loop
            playsInline
            autoPlay
          />
        ) : expense.imageUrl ? (
          <img
            src={expense.imageUrl}
            alt={`${expense.title} 사진 기록`}
            className="timeline-photo"
          />
        ) : null}
        <div className="entry-meta-row">
          <span className="entry-category">{formatLedgerCategory(expense)}</span>
          {expense.location && (
            <span className="entry-location" title={locationTitle}>
              <MapPin size={12} aria-hidden /> 위치 포함
            </span>
          )}
        </div>
        <div className="entry-title-row">
          <h3>{expense.title}</h3>
          <strong className={expense.kind === 'income' ? 'amount-income' : undefined}>
            {expense.kind === 'income' ? '+' : ''}
            {formatCurrency(expense.amount)}
          </strong>
        </div>
        {expense.moodScore && (
          <span
            className="entry-mood"
            aria-label={`기분 ${expense.moodScore}점, ${getMoodOption(expense.moodScore).label}`}
          >
            <span aria-hidden>{getMoodOption(expense.moodScore).face}</span>
            {expense.moodScore}/5 · {getMoodOption(expense.moodScore).label}
          </span>
        )}
        {expense.memo && <p>{expense.memo}</p>}
        <Check className="entry-check" size={18} aria-label="기록 완료" />
      </div>
    </article>
  )
}

function ExpenseEditor({
  formId,
  form,
  onChange,
  onLedgerKindChange,
  onSubmit,
  isSaving,
  assistantMode = false,
  detectedItemCount = 0,
  petName,
  suggestedCategories = [],
  entryTime,
  onEntryTimeChange,
  location,
  locationAllowed,
  locationStatus,
  locationMessage,
  onRequestLocation,
  onClearLocation,
}: {
  formId: string
  form: ExpenseForm
  onChange: ExpenseFormChange
  onLedgerKindChange: (kind: LedgerKind) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSaving: boolean
  assistantMode?: boolean
  detectedItemCount?: number
  petName?: string
  suggestedCategories?: CategoryId[]
  entryTime: string
  onEntryTimeChange: (time: string) => void
  location: ExpenseLocation | null
  locationAllowed: boolean
  locationStatus: LocationStatus
  locationMessage: string
  onRequestLocation: () => void
  onClearLocation: () => void
}) {
  return (
    <form
      id={formId}
      className={`expense-form quick-entry-form${assistantMode ? ' assistant-expense-form' : ''}`}
      onSubmit={onSubmit}
      aria-busy={isSaving}
    >
      {assistantMode && (
        <div className="memory-first-intro">
          <Check size={18} aria-hidden />
          <div>
            <strong>{detectedItemCount > 1 ? `${detectedItemCount}개 항목을 한 번에 묶었어요` : `${petName ?? '친구'}와 빠르게 확인해요`}</strong>
            <p>금액과 카테고리만 맞으면 바로 저장할 수 있어요.</p>
          </div>
        </div>
      )}
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
      <AmountEditor form={form} onChange={onChange} assistantMode={assistantMode} />
      <label className="quick-title-field">
        <span className="sr-only">{assistantMode ? '이 장면의 이름' : '제목'}</span>
        <input
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder={
            form.kind === 'income' ? '예: 급여, 캐시백' : '예: 오늘의 카페 기록'
          }
        />
      </label>
      <CategoryEditor
        form={form}
        onChange={onChange}
        assistantMode={assistantMode}
        suggestedCategories={suggestedCategories}
      />
      <MoodScoreEditor form={form} onChange={onChange} />
      <EntryContextEditor
        entryTime={entryTime}
        onEntryTimeChange={onEntryTimeChange}
        location={location}
        locationAllowed={locationAllowed}
        locationStatus={locationStatus}
        locationMessage={locationMessage}
        onRequestLocation={onRequestLocation}
        onClearLocation={onClearLocation}
      />
    </form>
  )
}

function EntryContextEditor({
  entryTime,
  onEntryTimeChange,
  location,
  locationAllowed,
  locationStatus,
  locationMessage,
  onRequestLocation,
  onClearLocation,
}: {
  entryTime: string
  onEntryTimeChange: (time: string) => void
  location: ExpenseLocation | null
  locationAllowed: boolean
  locationStatus: LocationStatus
  locationMessage: string
  onRequestLocation: () => void
  onClearLocation: () => void
}) {
  return (
    <section className="entry-context-editor" aria-label="기록 시간과 위치">
      <label className="entry-time-field">
        <span><Clock size={16} aria-hidden /> 기록 시간</span>
        <input
          type="time"
          value={entryTime}
          onChange={(event) => onEntryTimeChange(event.target.value)}
          aria-label="기록 시간"
        />
      </label>
      <div className="entry-location-field">
        {!locationAllowed ? (
          <span className="location-disabled">
            <MapPin size={16} aria-hidden /> 위치 저장 꺼짐
          </span>
        ) : location ? (
          <div className="location-ready">
            <span><MapPin size={16} aria-hidden /> 위치 포함</span>
            <button type="button" onClick={onClearLocation} aria-label="기록 위치 지우기">
              <X size={15} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="location-request"
            onClick={onRequestLocation}
            disabled={locationStatus === 'loading'}
          >
            <LocateFixed size={16} aria-hidden />
            {locationStatus === 'loading' ? '위치 확인 중' : '현재 위치 추가'}
          </button>
        )}
      </div>
      {locationMessage && (
        <small
          className={`entry-context-message${locationStatus === 'error' ? ' is-error' : ''}`}
          role="status"
        >
          {locationMessage}
          {location?.accuracyMeters ? ` · 약 ${location.accuracyMeters}m 범위` : ''}
        </small>
      )}
    </section>
  )
}

function AmountEditor({ form, onChange, assistantMode }: {
  form: ExpenseForm
  onChange: ExpenseFormChange
  assistantMode: boolean
}) {
  const numericAmount = Number(form.amount) || 0
  const addAmount = (amount: number) => {
    const next = Math.min(9_999_999_999, numericAmount + amount)
    onChange('amount', String(next))
    signalSoftImpact()
  }

  return (
    <div className="amount-editor">
      <div className="amount-editor-heading">
        <label htmlFor="cashlog-amount">{assistantMode ? '총 결제금액' : '결제금액'}</label>
        <output htmlFor="cashlog-amount" aria-live="polite">
          {numericAmount > 0 ? formatCurrency(numericAmount) : '금액 입력'}
        </output>
      </div>
      <div className="amount-input-shell">
        <input
          id="cashlog-amount"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={10}
          value={form.amount}
          aria-label="금액"
          onFocus={() => {
            if (form.amount === '0') onChange('amount', '')
          }}
          onChange={(event) => onChange('amount', normalizeAmountInput(event.target.value))}
          onBlur={() => {
            if (!form.amount) onChange('amount', '0')
          }}
          placeholder="0"
          aria-describedby="cashlog-amount-preview"
        />
        <span aria-hidden>원</span>
      </div>
      <span id="cashlog-amount-preview" className="sr-only">
        {numericAmount > 0 ? `${numericAmount.toLocaleString('ko-KR')}원` : '입력된 금액 없음'}
      </span>
      <div className="amount-quick-actions" role="group" aria-label="금액 빠른 더하기">
        {[1_000, 5_000, 10_000, 50_000].map((amount) => (
          <button key={amount} type="button" onClick={() => addAmount(amount)}>
            <Plus size={14} aria-hidden />
            {amount >= 10_000 ? `${amount / 10_000}만` : `${amount / 1_000}천`}
          </button>
        ))}
        <button
          type="button"
          className="amount-reset"
          onClick={() => {
            onChange('amount', '0')
            signalSoftImpact()
          }}
          aria-label="금액 초기화"
          title="금액 초기화"
        >
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function MoodScoreEditor({ form, onChange }: {
  form: ExpenseForm
  onChange: ExpenseFormChange
}) {
  return (
    <fieldset className="mood-score-fieldset">
      <div className="mood-score-heading">
        <legend>기분 점수</legend>
        <output aria-live="polite">
          {form.moodScore ? `${form.moodScore}/5 · ${moodOptions[form.moodScore - 1].label}` : '선택 안 함'}
        </output>
      </div>
      <div className="mood-score-options" role="group" aria-label="기분 점수 1점에서 5점">
        {moodOptions.map((option) => (
          <button
            key={option.score}
            type="button"
            className={form.moodScore === option.score ? 'active' : ''}
            aria-pressed={form.moodScore === option.score}
            aria-label={`${option.score}점 ${option.label}`}
            onClick={() => {
              onChange('moodScore', form.moodScore === option.score ? null : option.score)
              signalSoftImpact()
            }}
          >
            <span aria-hidden>{option.face}</span>
            <strong>{option.score}</strong>
            <small>{option.label}</small>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function CategoryEditor({
  form,
  onChange,
  assistantMode = false,
  suggestedCategories = [],
}: {
  form: ExpenseForm
  onChange: ExpenseFormChange
  assistantMode?: boolean
  suggestedCategories?: CategoryId[]
}) {
  const expenseMeta = getCategoryMeta(form.category as CategoryId)
  const incomeMeta = getIncomeCategoryMeta(form.category as IncomeCategoryId)
  const treeControls = form.kind === 'expense' ? (
    <>
      <div className="category-step-heading">
        <span>1</span>
        <strong>대분류</strong>
      </div>
      <div className="category-groups" role="group" aria-label="대분류">
        {categoryTree.map((group) => (
          <button
            key={group.id}
            type="button"
            className={
              group.id === expenseMeta.group.id ? 'category-pill active' : 'category-pill'
            }
            aria-pressed={group.id === expenseMeta.group.id}
            aria-label={`대분류: ${group.name}`}
            style={{ '--category-accent': group.color } as CSSProperties}
            onClick={() => {
              onChange('category', group.leaves[0].id)
              signalSoftImpact()
            }}
          >
            <span aria-hidden>{group.icon}</span>
            <strong>{group.name}</strong>
            {group.id === expenseMeta.group.id && <Check size={14} aria-hidden />}
          </button>
        ))}
      </div>
      <div className="category-step-heading category-leaf-heading">
        <span>2</span>
        <strong>소분류</strong>
        <small>{expenseMeta.group.name}</small>
      </div>
      <div className="category-leaves" role="group" aria-label="소분류">
        {expenseMeta.group.leaves.map((leaf) => (
          <button
            key={leaf.id}
            type="button"
            className={leaf.id === form.category ? 'category-leaf active' : 'category-leaf'}
            aria-pressed={leaf.id === form.category}
            aria-label={`소분류: ${leaf.name}`}
            onClick={() => {
              onChange('category', leaf.id)
              signalSoftImpact()
            }}
          >
            {leaf.name}
            {leaf.id === form.category && <Check size={15} aria-hidden />}
          </button>
        ))}
      </div>
    </>
  ) : (
    <>
      <div className="category-step-heading">
        <span>1</span>
        <strong>대분류</strong>
      </div>
      <div className="category-groups" role="group" aria-label="수입 대분류">
        {incomeCategoryTree.map((group) => (
          <button
            key={group.id}
            type="button"
            className={
              group.id === incomeMeta.group.id ? 'category-pill active' : 'category-pill'
            }
            aria-pressed={group.id === incomeMeta.group.id}
            aria-label={`수입 대분류: ${group.name}`}
            style={{ '--category-accent': group.color } as CSSProperties}
            onClick={() => {
              onChange('category', group.leaves[0].id)
              signalSoftImpact()
            }}
          >
            <span aria-hidden>{group.icon}</span>
            <strong>{group.name}</strong>
            {group.id === incomeMeta.group.id && <Check size={14} aria-hidden />}
          </button>
        ))}
      </div>
      <div className="category-step-heading category-leaf-heading">
        <span>2</span>
        <strong>소분류</strong>
        <small>{incomeMeta.group.name}</small>
      </div>
      <div className="category-leaves" role="group" aria-label="수입 소분류">
        {incomeMeta.group.leaves.map((leaf) => (
          <button
            key={leaf.id}
            type="button"
            className={leaf.id === form.category ? 'category-leaf active' : 'category-leaf'}
            aria-pressed={leaf.id === form.category}
            aria-label={`수입 소분류: ${leaf.name}`}
            onClick={() => {
              onChange('category', leaf.id)
              signalSoftImpact()
            }}
          >
            {leaf.name}
            {leaf.id === form.category && <Check size={15} aria-hidden />}
          </button>
        ))}
      </div>
    </>
  )

  return (
      <fieldset className={`category-fieldset${assistantMode ? ' category-fieldset-compact' : ''}`}>
        <legend className="quick-entry-category-legend">카테고리</legend>
        {assistantMode && form.kind === 'expense' && suggestedCategories.length > 0 && (
          <div className="category-suggestions" role="group" aria-label="사진과 가까운 카테고리">
            <span>빠른 선택</span>
            {suggestedCategories.map((category) => {
              const meta = getCategoryMeta(category)
              return (
                <button
                  key={category}
                  type="button"
                  className={category === form.category ? 'active' : ''}
                  aria-pressed={category === form.category}
                  onClick={() => {
                    onChange('category', category)
                    signalSoftImpact()
                  }}
                >
                  <span aria-hidden>{meta.group.icon}</span>
                  {meta.leaf.name}
                </button>
              )
            })}
          </div>
        )}
        {treeControls}
      </fieldset>
  )
}

function App() {
  return window.location.pathname === '/uichan'
    ? (
      <Suspense fallback={null}>
        <UichanAdmin />
      </Suspense>
    )
    : <CashlogApp />
}

export default App
