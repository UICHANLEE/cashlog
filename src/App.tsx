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

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

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
    return () => {
      stopCamera()
    }
  }, [stopCamera])

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

  const expenseToSlide = useCallback((expense: Expense, mode: 'day' | 'month') => {
    const dt = new Date(expense.dateTime)
    const relLabel =
      mode === 'day' ? formatDayLogRelativeKo(dt) : formatMonthLogRelativeKo(dt)
    const img = expense.imageUrl?.trim()
    const baseDetail = `${formatLedgerCategory(expense)}${expense.memo ? ` · ${expense.memo}` : ''}`
    return {
      id: expense.id,
      ...(img ? { imageUrl: img } : {}),
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
    stopCamera()
    setAddMode('closed')
  }

  const updateForm = (field: keyof ExpenseForm, value: string | LedgerKind) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const closeStory = useCallback(() => setStoryMode(null), [])

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
        </div>
        <div className="hero-actions">
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
                <div className="photo-source-row camera-only-row" role="group" aria-label="카메라">
                  <button type="button" className="camera-start-button" onClick={startCamera}>
                    카메라 열고 촬영
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
