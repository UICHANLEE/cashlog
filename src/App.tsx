import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import './App.css'
import {
  analyzePhoto,
  categoryTree,
  type CategoryId,
  createExpenseFromAnalysis,
  createManualExpense,
  type Expense,
  formatCategoryLabel,
  formatCurrency,
  generateDailyLog,
  getCalendarDays,
  getCategoryMeta,
  getExpensesForDate,
  getMonthlyTotal,
  migrateCategoryId,
  type PhotoAnalysis,
} from './domain/cashlog'

type AddMode = 'closed' | 'choice' | 'photo' | 'manual'

type ExpenseForm = {
  title: string
  amount: string
  category: CategoryId
  memo: string
}

const STORAGE_KEY = 'cashlog.expenses'

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const loadExpenses = (): Expense[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as Expense[]
    return parsed.map((expense) => ({
      ...expense,
      category: migrateCategoryId(String(expense.category)),
    }))
  } catch {
    return []
  }
}

const defaultLeafId = categoryTree[0]?.leaves[0]?.id ?? 'misc_uncat'

const emptyForm = (): ExpenseForm => ({
  title: '',
  amount: '',
  category: defaultLeafId,
  memo: '',
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
  }, [expenses])

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
  const yearMonth = `${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, '0')}`
  const monthlyTotal = getMonthlyTotal(expenses, yearMonth)

  const openChoice = () => {
    setForm(emptyForm())
    setAnalysis(null)
    setPhotoPreview('')
    setAddMode('choice')
  }

  const openManual = () => {
    setForm(emptyForm())
    setAnalysis(null)
    setPhotoPreview('')
    setAddMode('manual')
  }

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const nextAnalysis = await analyzePhoto(file)
    const nextPreview = URL.createObjectURL(file)

    setAnalysis(nextAnalysis)
    setPhotoPreview(nextPreview)
    setForm({
      title: nextAnalysis.suggestedTitle,
      amount: String(nextAnalysis.suggestedAmount),
      category: nextAnalysis.suggestedCategory,
      memo: nextAnalysis.suggestedMemo,
    })
  }

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const amount = Number(form.amount)
    if (!form.title.trim() || Number.isNaN(amount) || amount <= 0) return

    const dateTime = new Date(`${selectedDate}T12:00:00`).toISOString()
    const expense =
      addMode === 'photo' && analysis
        ? {
            ...createExpenseFromAnalysis({
              analysis,
              imageUrl: photoPreview,
              dateTime,
            }),
            title: form.title.trim(),
            amount,
            category: form.category,
            memo: form.memo.trim(),
          }
        : createManualExpense({
            title: form.title.trim(),
            amount,
            category: form.category,
            memo: form.memo.trim(),
            dateTime,
          })

    setExpenses((current) => [expense, ...current])
    setAddMode('closed')
  }

  const updateForm = (field: keyof ExpenseForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Photo first money diary</p>
          <h1>Cashlog</h1>
          <p className="hero-copy">
            사진 한 장으로 지출과 하루의 기억을 함께 남기는 웹 가계부 MVP입니다.
          </p>
        </div>
        <div className="hero-actions">
          <div>
            <span>이번 달 지출</span>
            <strong>{formatCurrency(monthlyTotal)}</strong>
          </div>
          <button type="button" className="primary-button" onClick={openChoice}>
            + 기록 추가
          </button>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="calendar-card">
          <div className="section-heading">
            <p className="eyebrow">Calendar</p>
            <h2>
              {visibleMonth.year}년 {visibleMonth.month + 1}월
            </h2>
          </div>
          <div className="weekday-row">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const dayExpenses = getExpensesForDate(expenses, day.isoDate)
              const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0)
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
                  {total > 0 && <strong>{formatCurrency(total)}</strong>}
                  {hasPhoto && <small>사진 로그</small>}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="daily-card">
          <div className="section-heading">
            <p className="eyebrow">Daily log</p>
            <h2>{selectedDate}</h2>
          </div>
          <p className="daily-summary">{dailyLog.summary}</p>

          <div className="timeline">
            {selectedExpenses.length === 0 ? (
              <div className="empty-state">아직 기록이 없어요. + 버튼으로 첫 로그를 남겨보세요.</div>
            ) : (
              selectedExpenses.map((expense) => {
                const { group } = getCategoryMeta(expense.category)
                return (
                  <article className="expense-card" key={expense.id}>
                    {expense.imageUrl && (
                      <img src={expense.imageUrl} alt="" className="expense-image" />
                    )}
                    <div>
                      <div className="expense-title-row">
                        <h3>{expense.title}</h3>
                        <strong>{formatCurrency(expense.amount)}</strong>
                      </div>
                      <p>
                        <span
                          className="category-label"
                          style={{ color: group.color }}
                        >
                          {formatCategoryLabel(expense.category)}
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
                <h2>오늘의 소비를 남겨요</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setAddMode('closed')}>
                닫기
              </button>
            </div>

            {addMode === 'choice' && (
              <div className="choice-grid">
                <button
                  type="button"
                  className="choice-card"
                  aria-label="카메라/사진 선택"
                  onClick={() => setAddMode('photo')}
                >
                  <span>사진</span>
                  <strong>카메라/사진 선택</strong>
                  <small>사진을 기반으로 금액과 카테고리를 추천해요.</small>
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
                <label className="file-picker">
                  사진 파일 선택
                  <input
                    aria-label="사진 파일 선택"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhoto}
                  />
                </label>
                {photoPreview && <img src={photoPreview} alt="" className="preview-image" />}
                {analysis && (
                  <p className="analysis-note">
                    Mock AI 분석 신뢰도 {Math.round(analysis.confidence * 100)}% ·{' '}
                    {analysis.rawText}
                  </p>
                )}
                <ExpenseEditor form={form} onChange={updateForm} onSubmit={handleSave} />
              </div>
            )}

            {addMode === 'manual' && (
              <ExpenseEditor form={form} onChange={updateForm} onSubmit={handleSave} />
            )}
          </div>
        </section>
      )}
    </main>
  )
}

function ExpenseEditor({
  form,
  onChange,
  onSubmit,
}: {
  form: ExpenseForm
  onChange: (field: keyof ExpenseForm, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const activeGroup = getCategoryMeta(form.category).group

  return (
    <form className="expense-form" onSubmit={onSubmit}>
      <label>
        제목
        <input
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder="예: 오늘의 카페 기록"
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
        <legend>카테고리</legend>
        <p className="category-hint">
          편한가계부처럼 대분류를 고른 뒤 소분류를 선택하세요.
        </p>
        <div className="category-groups" role="group" aria-label="대분류">
          {categoryTree.map((group) => (
            <button
              key={group.id}
              type="button"
              className={
                group.id === activeGroup.id ? 'category-pill active' : 'category-pill'
              }
              aria-pressed={group.id === activeGroup.id}
              aria-label={`대분류: ${group.name}`}
              onClick={() => onChange('category', group.leaves[0].id)}
            >
              <span aria-hidden>{group.icon}</span>
              {group.name}
            </button>
          ))}
        </div>
        <div className="category-leaves" role="group" aria-label="소분류">
          {activeGroup.leaves.map((leaf) => (
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
          선택: <strong>{formatCategoryLabel(form.category)}</strong>
        </p>
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
