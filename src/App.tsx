import {
  type ChangeEvent,
  type FormEvent,
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
  Image as ImageIcon,
  CloudRain,
  Heart,
  Mic,
  PawPrint,
  Pencil,
  Smile,
  Sparkles,
  Utensils,
  Users,
  UserRound,
  X,
} from 'lucide-react'
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
  getCalendarDays,
  getStoryEntriesForDate,
  getStoryEntriesForMonth,
  getExpensesForDate,
  getCategoryMeta,
  getIncomeCategoryMeta,
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
import { PetPortrait } from './components/InteractivePet3D'
import { PetCorner } from './components/PetCorner'
import { UichanAdmin } from './admin/UichanAdmin'
import {
  defaultPetState,
  normalizePetState,
  type CatBreedId,
  type DogBreedId,
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

type AddMode = 'closed' | 'choice' | 'photo' | 'manual'
type StoryMode = null | 'day' | 'month'
type AppView = 'diary' | 'calendar' | 'pets'
type AuthMode = 'signIn' | 'signUp' | 'magic'

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

function CashlogApp() {
  const now = new Date()
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses)
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [visibleMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [addMode, setAddMode] = useState<AddMode>('closed')
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [photoPreview, setPhotoPreview] = useState('')
  const photoFileRef = useRef<File | null>(null)
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [trainingImageConsent, setTrainingImageConsent] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
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
  const [, setSyncStatus] = useState('Supabase 미연결 · 로컬 저장 중')
  const authClient = useMemo(() => createCashlogAuthClient(), [])
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
    setTrainingImageConsent(false)
    clearRecordTimer()
    setIsRecording(false)
    setRecordSeconds(0)
    recordedChunksRef.current = []
    photoFileRef.current = null
    posterFileRef.current = null
    mediaRecorderRef.current = null
  }, [clearRecordTimer])

  const applyPhotoFile = useCallback(async (file: File) => {
    setCameraError(null)
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

  const hydrateExpenseImages = useCallback(
    async (items: Expense[]) => {
      if (!storage) return items
      return Promise.all(
        items.map(async (item) => {
          if (!item.imageStoragePath) return item
          try {
            return { ...item, imageUrl: await storage.createSignedUrl(item.imageStoragePath) }
          } catch {
            return { ...item, imageUrl: undefined }
          }
        }),
      )
    },
    [storage],
  )

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
    setPetState((prev) =>
      kind === 'cat' ? { ...prev, catOutfit: outfit } : { ...prev, dogOutfit: outfit },
    )
  }, [])

  const handlePaletteChange = useCallback((kind: PetKind, palette: PetPaletteId) => {
    setPetState((prev) =>
      kind === 'cat' ? { ...prev, catPalette: palette } : { ...prev, dogPalette: palette },
    )
  }, [])

  const handlePetKindChange = useCallback((kind: PetKind) => {
    setPetState((prev) => ({ ...prev, selectedKind: kind }))
  }, [])

  const handleBreedChange = useCallback(
    (kind: 'cat' | 'dog', breed: CatBreedId | DogBreedId) => {
      setPetState((prev) =>
        kind === 'cat'
          ? { ...prev, catBreed: breed as CatBreedId, selectedKind: 'cat' }
          : { ...prev, dogBreed: breed as DogBreedId, selectedKind: 'dog' },
      )
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
  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  )
  const yearMonth = useMemo(
    () => `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, '0')}`,
    [visibleMonth.year, visibleMonth.month],
  )
  const selectedPetName = petState.selectedKind === 'cat' ? petState.catName : petState.dogName
  const selectedDaySpent = dayExpenseTotal(selectedExpenses)
  const selectedDayEarned = dayIncomeTotal(selectedExpenses)
  const selectedDayPhotos = selectedExpenses.filter((expense) => expense.imageUrl).slice(0, 3)
  const selectedDayExpenseMoments = selectedExpenses.filter((expense) => expense.kind === 'expense')
  const dominantDayCategory = (() => {
    const counts = new Map<string, { count: number; label: string }>()
    selectedDayExpenseMoments.forEach((expense) => {
      const key = String(expense.category)
      const current = counts.get(key)
      counts.set(key, { count: (current?.count ?? 0) + 1, label: formatLedgerCategory(expense) })
    })
    return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.label
  })()
  const selectedDateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${selectedDate}T12:00:00`))

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

  const openPhotoCapture = async () => {
    stopCamera()
    revokeAndClearPreview()
    setCaptureKind('photo')
    setForm(emptyForm())
    setAiContext(null)
    setAddMode('photo')
    await startCamera()
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
        await applyPhotoFile(poster)
      } else {
        setForm(emptyForm())
      }
      return
    }

    await applyPhotoFile(file)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const amount = Number(form.amount)
    if (!form.title.trim() || Number.isNaN(amount) || amount <= 0) return

    if (photoFileRef.current && authClient.isConfigured && !storage) {
      setShowAccount(true)
      setAuthMessage('사진 보관본을 계정에 저장하려면 먼저 로그인해 주세요.')
      return
    }

    setIsSaving(true)

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

    const photoFile = photoFileRef.current
    let preparedImage: Awaited<ReturnType<typeof prepareImageForStorage>> | null = null
    if (photoFile && storage) {
      try {
        preparedImage = await prepareImageForStorage(photoFile)
        const uploaded = await storage.uploadImage(preparedImage.file, expense.id)
        expense = {
          ...expense,
          imageStoragePath: uploaded.path,
          imageUrl: uploaded.signedUrl,
        }
        setCameraError(null)
      } catch (e) {
        setCameraError(
          e instanceof Error ? `사진 보관에 실패했어요: ${e.message.slice(0, 80)}` : '사진 보관에 실패했어요.',
        )
        setIsSaving(false)
        return
      }
    }

    setExpenses((current) => [expense, ...current])
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
      repository
        .upsertExpense(expense)
        .then(() =>
          preparedImage && expense.imageStoragePath
            ? repository.saveImageMetadata({
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
              })
            : undefined,
        )
        .then(() =>
          repository.saveDetectedItems(
            expense.id,
            analysis?.detectedItems ?? [],
            analysis?.model,
          ),
        )
        .then(() =>
          feedback
            ? repository.saveCategoryFeedback(feedback)
            : undefined,
        )
        .then(() => setSyncStatus('새 기록 클라우드 저장 완료'))
        .catch((e: unknown) => {
          setSyncStatus(e instanceof Error ? `클라우드 저장 실패: ${e.message.slice(0, 80)}` : '클라우드 저장 실패')
        })
    }
    stopCamera()
    // 미리보기 URL의 소유권을 저장된 기록으로 넘김 (여기서 revoke 하지 않음)
    setPhotoPreview('')
    photoFileRef.current = null
    setVideoPreview('')
    setAnalysis(null)
    setTrainingImageConsent(false)
    setAddMode('closed')
    setIsSaving(false)
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

  const handleAiContext = (context: 'friends' | 'solo') => {
    setAiContext(context)
    updateForm('memo', context === 'friends' ? '친구와 함께' : '혼자 보낸 시간')
  }

  return (
    <main className={`app-shell${activeView === 'diary' ? ' timeline-app-shell' : ''}`}>
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
          <Sparkles size={16} aria-hidden /> 오늘 한줄
        </button>
      </header>

      {showAccount && (
        <section className="account-card account-drawer" aria-label="로그인과 동기화">
          <div>
            <p className="eyebrow">MY CASHLOG</p>
            <h2>{session?.user?.email ?? '내 기록 지키기'}</h2>
            {!session && <p>로그인하면 사진 기록과 캐릭터가 모든 기기에서 이어져요.</p>}
          </div>
          {session ? (
              <div className="account-actions">
                <button type="button" className="ghost-button" onClick={syncWithCloud}>지금 동기화</button>
                <a className="ghost-button" href="/profile.html">프로필 관리</a>
                <button type="button" className="ghost-button" onClick={handleSignOut}>로그아웃</button>
              </div>
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
                      <span><strong>[필수]</strong> 계정·가계부 기록 수집 및 이용에 동의합니다.</span>
                    </label>
                    <label>
                      <input type="checkbox" checked={signupConsents.photoAndTime} onChange={(event) => setSignupConsents((current) => ({ ...current, photoAndTime: event.target.checked }))} />
                      <span><strong>[필수]</strong> 사진과 촬영·기록 시간의 저장 및 AI 분석에 동의합니다.</span>
                    </label>
                    <label>
                      <input type="checkbox" checked={signupConsents.location} onChange={(event) => setSignupConsents((current) => ({ ...current, location: event.target.checked }))} />
                      <span><strong>[선택]</strong> 사진 촬영 위치의 저장 및 개인화에 동의합니다.</span>
                    </label>
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
                      <span><strong>[필수]</strong> 계정·가계부 기록 수집 및 이용에 동의합니다.</span>
                    </label>
                    <details>
                      <summary>개인정보 수집 내용</summary>
                      <p>이메일, 계정 식별자, 소비 기록을 가입·동기화·서비스 제공 목적으로 처리하며, 탈퇴 시 지체 없이 삭제합니다. 관련 법령에 따른 보존 의무가 있는 정보는 해당 기간 동안 보관할 수 있습니다.</p>
                    </details>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.photoAndTime}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, photoAndTime: event.target.checked }))}
                      />
                      <span><strong>[필수]</strong> 사진과 촬영·기록 시간의 저장 및 AI 분석에 동의합니다.</span>
                    </label>
                    <details>
                      <summary>사진 처리 내용</summary>
                      <p>사진은 용량을 줄인 비공개 보관본으로 계정에 저장되며 카테고리 추천에 사용됩니다. 다른 사용자는 볼 수 없고, 원할 때 삭제를 요청할 수 있습니다.</p>
                    </details>
                    <label>
                      <input
                        type="checkbox"
                        checked={signupConsents.location}
                        onChange={(event) => setSignupConsents((current) => ({ ...current, location: event.target.checked }))}
                      />
                      <span><strong>[선택]</strong> 사진 촬영 위치의 저장 및 개인화에 동의합니다.</span>
                    </label>
                    <p className="consent-note">위치 동의를 거부해도 가입할 수 있으며, 실제 위치 권한은 기능을 사용할 때 기기에서 다시 확인합니다.</p>
                  </fieldset>
                )}
                <button type="submit">{authMode === 'signUp' ? '가입하고 시작' : authMode === 'magic' ? '메일 링크 받기' : '로그인'}</button>
              </form>
            )}
          {authMessage && <small className="account-message">{authMessage}</small>}
        </section>
      )}

      {activeView === 'pets' ? (
        <PetCorner
          totalRecords={expenses.length}
          petState={petState}
          onKindChange={handlePetKindChange}
          onBreedChange={handleBreedChange}
          onOutfitChange={handleOutfitChange}
          onPaletteChange={handlePaletteChange}
        />
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
              <button type="button" className="date-switcher" onClick={() => setActiveView('calendar')}>
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
            <PetPortrait kind={petState.selectedKind} name={selectedPetName} className="timeline-pet" />
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
                  <span><Sparkles size={14} aria-hidden /> AI 기록 예시</span>
                </div>
                <div>
                  <p className="empty-question">오늘 첫 장면, 나랑 찍어볼까?</p>
                  <button type="button" className="empty-camera-link" onClick={openPhotoCapture}>
                    <Camera size={18} aria-hidden /> 사진으로 시작
                  </button>
                </div>
              </div>
            ) : (
              selectedExpenses.map((expense) => {
                const accent = ledgerAccentColor(expense)
                const isPhoto = Boolean(expense.imageUrl || expense.videoUrl)
                return (
                  <article className={`timeline-entry${isPhoto ? ' timeline-entry-photo' : ''}`} key={expense.id}>
                    <time dateTime={expense.dateTime}>
                      {new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(expense.dateTime))}
                    </time>
                    <span className="timeline-node" style={{ backgroundColor: accent }} aria-hidden>
                      {isPhoto ? <Camera size={18} /> : expense.kind === 'income' ? <Sparkles size={18} /> : <Utensils size={18} />}
                    </span>
                    <div className="timeline-entry-body">
                      {expense.videoUrl ? (
                        <video className="timeline-photo" src={expense.videoUrl} poster={expense.imageUrl} muted loop playsInline autoPlay />
                      ) : expense.imageUrl ? (
                        <img src={expense.imageUrl} alt={`${expense.title} 사진 기록`} className="timeline-photo" />
                      ) : null}
                      <span className="entry-category">{formatLedgerCategory(expense)}</span>
                      <div className="entry-title-row">
                        <h3>{expense.title}</h3>
                        <strong className={expense.kind === 'income' ? 'amount-income' : undefined}>
                          {expense.kind === 'income' ? '+' : ''}{formatCurrency(expense.amount)}
                        </strong>
                      </div>
                      {expense.memo && <p>{expense.memo}</p>}
                      <Check className="entry-check" size={18} aria-label="기록 완료" />
                    </div>
                  </article>
                )
              })
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
            <button type="button" className="dock-secondary" onClick={openManual} aria-label="음성 또는 직접 입력">
              <Mic size={23} aria-hidden />
              <span>말하기</span>
            </button>
          </div>
          <button type="button" className="sr-only-action" onClick={openChoice}>+ 기록 추가</button>
        </section>
      )}

      <nav className="bottom-nav" aria-label="주요 화면">
        <button type="button" className={activeView === 'diary' ? 'active' : ''} aria-pressed={activeView === 'diary'} onClick={() => setActiveView('diary')}>
          <BarChart3 size={22} aria-hidden /><span>하루 타임라인</span>
        </button>
        <button type="button" className={activeView === 'calendar' ? 'active' : ''} aria-pressed={activeView === 'calendar'} onClick={() => setActiveView('calendar')}>
          <CalendarDays size={22} aria-hidden /><span>달력</span>
        </button>
        <button type="button" className={activeView === 'pets' ? 'active' : ''} aria-pressed={activeView === 'pets'} onClick={() => setActiveView('pets')}>
          <PawPrint size={22} aria-hidden /><span>{selectedPetName}</span>
        </button>
      </nav>

      {addMode !== 'closed' && (
        <section className="sheet-backdrop" aria-label="기록 추가">
          <div className="add-sheet">
            <div className="sheet-header">
              <div>
                <p className="eyebrow">PHOTO LOG</p>
                <h2>{addMode === 'photo' ? '찍은 장면 정리하기' : '직접 기록하기'}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="기록 창 닫기"
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
                <X size={22} aria-hidden />
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
                  <div className="analysis-note">
                    <span className="analysis-status"><Sparkles size={15} aria-hidden /> AI 임시 기록</span>
                    <p>
                      {(analysis.model ?? (analysis.engine === 'openai' ? 'Vision' : '목(mock)'))}
                      {' '}분석 신뢰도 {Math.round(analysis.confidence * 100)}% ·{' '}
                      {analysis.categoryReason ?? analysis.rawText}
                      {analysis.needUserCheck ? ' · 확인 필요' : ''}
                    </p>
                    {analysis.detectedItems?.length ? (
                      <div className="shopping-moment-summary">
                        <strong>{analysis.detectedItems.length}개 상품을 한 장면으로 묶었어요</strong>
                        <p>하나씩 적지 않아도 괜찮아요. 총 결제와 대표 분위기만 확인해 주세요.</p>
                        <details>
                          <summary>AI가 발견한 항목 보기</summary>
                          <div className="detected-item-list" aria-label="탐지 상품 목록">
                            {analysis.detectedItems.slice(0, 8).map((item) => (
                              <span key={`${item.name}-${item.category}`}>{item.displayName}</span>
                            ))}
                            {analysis.detectedItems.length > 8 && <span>+{analysis.detectedItems.length - 8}개</span>}
                          </div>
                        </details>
                      </div>
                    ) : analysis.detectedObjects?.length ? (
                      <small>단서: {analysis.detectedObjects.slice(0, 3).join(', ')}</small>
                    ) : null}
                    <div className="pet-context-question">
                      <PetPortrait kind={petState.selectedKind} name={selectedPetName} className="question-pet" />
                      <div>
                        <strong>친구랑 함께한 장면이야?</strong>
                        <div role="group" aria-label="사진 속 상황">
                          <button type="button" className={aiContext === 'friends' ? 'active' : ''} onClick={() => handleAiContext('friends')}>응</button>
                          <button type="button" className={aiContext === 'solo' ? 'active' : ''} onClick={() => handleAiContext('solo')}>혼자</button>
                        </div>
                      </div>
                    </div>
                    <label className="training-consent">
                      <input
                        type="checkbox"
                        checked={trainingImageConsent}
                        onChange={(event) => setTrainingImageConsent(event.target.checked)}
                      />
                      <span>
                        <strong>[선택]</strong> 이 사진을 모델 학습·평가 후보로 추가
                        보관하는 데 동의합니다.
                      </span>
                    </label>
                    <small className="training-consent-note">
                      동의하지 않으면 사진은 학습 후보가 되지 않으며, 확정 카테고리만
                      추천 품질 통계로 기록됩니다.
                    </small>
                  </div>
                )}
                <ExpenseEditor
                  form={form}
                  onChange={updateForm}
                  onLedgerKindChange={handleLedgerKindChange}
                  onSubmit={handleSave}
                  isSaving={isSaving}
                  assistantMode
                  detectedItemCount={analysis?.detectedItems?.length ?? 0}
                  petName={selectedPetName}
                />
              </div>
            )}

            {addMode === 'manual' && (
              <ExpenseEditor
                form={form}
                onChange={updateForm}
                onLedgerKindChange={handleLedgerKindChange}
                onSubmit={handleSave}
                isSaving={isSaving}
              />
            )}
          </div>
        </section>
      )}
      <footer className="legal-footer">
        <a href="/privacy.html">개인정보처리방침</a>
        <a href="https://github.com/UICHANLEE/cashlog">GitHub</a>
      </footer>
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
  isSaving,
  assistantMode = false,
  detectedItemCount = 0,
  petName,
}: {
  form: ExpenseForm
  onChange: (field: keyof ExpenseForm, value: string | LedgerKind) => void
  onLedgerKindChange: (kind: LedgerKind) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSaving: boolean
  assistantMode?: boolean
  detectedItemCount?: number
  petName?: string
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
    <form className={`expense-form${assistantMode ? ' assistant-expense-form' : ''}`} onSubmit={onSubmit}>
      {assistantMode && (
        <div className="memory-first-intro">
          <Sparkles size={18} aria-hidden />
          <div>
            <strong>{detectedItemCount > 1 ? `${detectedItemCount}개 항목, 한 번만 확인하면 끝!` : `${petName ?? '친구'}가 먼저 채워뒀어요`}</strong>
            <p>틀린 부분만 고치고 이 장면으로 저장해도 충분해요.</p>
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
      <label>
        {assistantMode ? '이 장면의 이름' : '제목'}
        <input
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder={
            form.kind === 'income' ? '예: 급여, 캐시백' : '예: 오늘의 카페 기록'
          }
        />
      </label>
      <label>
        {assistantMode ? '총 결제금액' : '금액'}
        <input
          inputMode="numeric"
          value={form.amount}
          onChange={(event) => onChange('amount', event.target.value)}
          placeholder="0"
        />
      </label>
      <fieldset className="feeling-fieldset">
        <legend>이 소비는 어떤 기분으로 남길까?</legend>
        <div className="feeling-options" role="group" aria-label="소비 기분">
          <button type="button" className={form.memo === '기분 좋은 소비' ? 'active' : ''} onClick={() => onChange('memo', '기분 좋은 소비')}><Smile size={17} />기분 좋아</button>
          <button type="button" className={form.memo === '나를 위한 소비' ? 'active' : ''} onClick={() => onChange('memo', '나를 위한 소비')}><Heart size={17} />나를 위해</button>
          <button type="button" className={form.memo === '같이 즐긴 소비' ? 'active' : ''} onClick={() => onChange('memo', '같이 즐긴 소비')}><Users size={17} />같이 즐김</button>
          <button type="button" className={form.memo === '조금 아쉬운 소비' ? 'active' : ''} onClick={() => onChange('memo', '조금 아쉬운 소비')}><CloudRain size={17} />조금 아쉬워</button>
        </div>
      </fieldset>
      {assistantMode ? (
        <details className="expense-more-details">
          <summary>카테고리와 메모 직접 고치기</summary>
          <div className="expense-more-fields">
            <CategoryEditor form={form} onChange={onChange} categoryLegend={categoryLegend} categoryHint={categoryHint} expenseActiveGroup={expenseActiveGroup} incomeActiveGroup={incomeActiveGroup} />
            <MemoEditor form={form} onChange={onChange} />
          </div>
        </details>
      ) : (
        <>
          <details className="expense-more-details category-quick-details">
            <summary>
              카테고리 · {form.kind === 'expense'
                ? formatCategoryLabel(form.category as CategoryId)
                : formatIncomeCategoryLabel(form.category as IncomeCategoryId)}
            </summary>
            <div className="expense-more-fields">
              <CategoryEditor form={form} onChange={onChange} categoryLegend={categoryLegend} categoryHint={categoryHint} expenseActiveGroup={expenseActiveGroup} incomeActiveGroup={incomeActiveGroup} />
            </div>
          </details>
          <MemoEditor form={form} onChange={onChange} />
        </>
      )}
      <button type="submit" className="primary-button" disabled={isSaving}>
        {isSaving ? '사진 보관 중...' : assistantMode ? '이 장면으로 저장' : '저장하기'}
      </button>
    </form>
  )
}

function CategoryEditor({ form, onChange, categoryLegend, categoryHint, expenseActiveGroup, incomeActiveGroup }: {
  form: ExpenseForm
  onChange: (field: keyof ExpenseForm, value: string | LedgerKind) => void
  categoryLegend: string
  categoryHint: string
  expenseActiveGroup: ReturnType<typeof getCategoryMeta>['group']
  incomeActiveGroup: ReturnType<typeof getIncomeCategoryMeta>['group']
}) {
  return <fieldset className="category-fieldset">
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
}

function MemoEditor({ form, onChange }: {
  form: ExpenseForm
  onChange: (field: keyof ExpenseForm, value: string | LedgerKind) => void
}) {
  return (
      <label>
        메모
        <textarea
          value={form.memo}
          onChange={(event) => onChange('memo', event.target.value)}
          placeholder="기억하고 싶은 내용을 남겨보세요."
        />
      </label>
  )
}

function App() {
  return window.location.pathname === '/uichan' ? <UichanAdmin /> : <CashlogApp />
}

export default App
