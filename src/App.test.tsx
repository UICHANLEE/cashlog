import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createExpenseFromAnalysis, createManualExpense } from './domain/cashlog'

const STORAGE_KEY = 'cashlog.expenses'

describe('Cashlog photo MVP', () => {
  beforeEach(() => {
    localStorage.clear()
    const NativeURL = URL
    class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:cashlog-photo')
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', MockURL)
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shows disabled story playback until any entries exist', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /오늘 한줄/i })).toBeDisabled()
    expect(screen.getByText('로그인')).toBeInTheDocument()
  })

  it('keeps the login form discoverable before the backend is configured', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '계정 메뉴 열기' }))
    const account = screen.getByRole('region', { name: '로그인과 동기화' })
    expect(within(account).getByLabelText('로그인 이메일')).toBeInTheDocument()
    expect(within(account).getByLabelText('로그인 비밀번호')).toBeInTheDocument()

    const loginButtons = within(account).getAllByRole('button', { name: '로그인' })
    await user.click(loginButtons[loginButtons.length - 1])
    expect(within(account).getByText('로그인 서비스 연결이 아직 완료되지 않았어요.')).toBeInTheDocument()
  })

  it('offers Google and Kakao login and asks for required consent first', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    render(<App />)

    await user.click(screen.getByRole('button', { name: '계정 메뉴 열기' }))
    const account = screen.getByRole('region', { name: '로그인과 동기화' })
    expect(within(account).getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument()
    expect(within(account).getByRole('button', { name: '카카오로 계속하기' })).toBeInTheDocument()

    await user.click(within(account).getByRole('button', { name: 'Google로 계속하기' }))

    expect(within(account).getByText('간편 가입에 필요한 필수 동의를 확인해 주세요.')).toBeInTheDocument()
    expect(within(account).getByText('간편 가입 동의')).toBeInTheDocument()
  })

  it('keeps the pet playground behind a dedicated tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText(/함께 쓰는 가계부/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '하루 타임라인' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '나비' }))

    expect(screen.getByText(/나비와 함께 쓰는 가계부/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '나비' })).toHaveAttribute('aria-pressed', 'true')

    const petStages = screen.getAllByRole('button', { name: /나비 쓰다듬기\. 드래그하면/ })
    await user.click(petStages[petStages.length - 1])
    expect(screen.getByText('나비가 기분 좋게 꼬리를 흔들어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /초코 캐릭터.*강아지.*말티즈/ }))
    expect(screen.getAllByRole('button', { name: /초코 쓰다듬기\. 드래그하면/ })).toHaveLength(1)
  })

  it('applies and remembers Nabi wardrobe and color choices', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '나비' }))
    const hoodie = screen.getByRole('button', { name: '나비 말랑 후디 옷' })
    await user.click(hoodie)
    expect(hoodie).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('나비 현재 스타일')).toHaveTextContent('말랑 후디')

    await user.click(screen.getByRole('tab', { name: '컬러' }))
    await user.click(screen.getByRole('button', { name: '나비 딸기우유 색칠' }))
    expect(screen.getByLabelText('나비 현재 스타일')).toHaveTextContent('딸기우유')

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('cashlog.pet') ?? '{}')).toMatchObject({
        catOutfit: 'hoodie',
        catPalette: 'strawberry',
      })
    })
  })

  it('opens the day photo story reel when 스토리 is enabled', async () => {
    const user = userEvent.setup()
    const todaySlice = new Date().toISOString().slice(0, 10)
    const expense = createExpenseFromAnalysis({
      analysis: {
        suggestedAmount: 6200,
        suggestedCategory: 'meal_cafe',
        suggestedTitle: '오늘의 카페',
        suggestedMemo: '',
        confidence: 0.9,
        rawText: '',
      },
      imageUrl: 'blob:cashlog-photo',
      dateTime: `${todaySlice}T12:00:00.000Z`,
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([expense]))

    render(<App />)

    await user.click(screen.getByRole('button', { name: /오늘 한줄/i }))
    const dialog = screen.getByRole('dialog', { name: `${todaySlice} 기록` })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('오늘의 카페')).toBeInTheDocument()
  })

  it('lets a user add a manual expense without a photo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    await user.type(screen.getByLabelText('제목'), '지하철 충전')
    await user.type(screen.getByLabelText('금액'), '10000')
    await user.click(screen.getByRole('button', { name: '5점 최고야' }))
    await user.click(screen.getByRole('button', { name: '대분류: 교통' }))
    await user.click(screen.getByRole('button', { name: '소분류: 대중교통' }))
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: '기록 추가' })).not.toBeInTheDocument())

    expect(screen.getByText('지하철 충전')).toBeInTheDocument()
    expect(screen.getAllByText('10,000원').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/교통 · 대중교통/).length).toBeGreaterThan(0)
    expect(screen.getByText(/5\/5 · 최고야/)).toBeInTheDocument()
  })

  it('keeps model-improvement image retention as a separate opt-in', async () => {
    const user = userEvent.setup()
    render(<App />)
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'cafe.jpg', {
      type: 'image/jpeg',
    })

    await user.upload(screen.getByLabelText('갤러리에서 사진 선택'), photo)

    const consent = await screen.findByRole('checkbox', {
      name: /이 사진을 모델 학습·평가 후보로 추가 보관/,
    })
    expect(consent).not.toBeChecked()
    expect(screen.getByText(/확정 카테고리만 추천 품질 통계로 기록/)).toBeInTheDocument()
    await user.click(consent)
    expect(consent).toBeChecked()
  })

  it('enables 하루 스토리 after a manual expense (no photo)', async () => {
    const user = userEvent.setup()
    const todaySlice = new Date().toISOString().slice(0, 10)
    const manual = createManualExpense({
      title: '메모만',
      amount: 3000,
      category: 'meal_cafe',
      memo: '',
      dateTime: `${todaySlice}T12:00:00.000Z`,
      kind: 'expense',
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([manual]))

    render(<App />)

    expect(screen.getByRole('button', { name: /오늘 한줄/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /오늘 한줄/i }))
    const dialog = screen.getByRole('dialog', { name: `${todaySlice} 기록` })
    expect(within(dialog).getByText('메모만')).toBeInTheDocument()
  })

  it('lets a user add manual income via 수입 toggle', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    await user.click(screen.getByRole('button', { name: '수입' }))
    await user.type(screen.getByLabelText('제목'), '환급')
    await user.type(screen.getByLabelText('금액'), '12000')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(screen.getByText('환급')).toBeInTheDocument()
    expect(screen.getAllByText('+12,000원').length).toBeGreaterThan(0)
    expect(screen.getByText(/급여·근로 · 월급/)).toBeInTheDocument()
  })

  it('lets a configured user log in with email and password', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/auth/v1/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_in: 3600,
              user: { id: 'user-1', email: 'me@example.com' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/rest/v1/cashlog_entries')) {
          return new Response(init?.method === 'POST' ? '' : '[]', { status: 200 })
        }
        if (url.includes('/rest/v1/cashlog_pet_profiles')) {
          return new Response(init?.method === 'POST' ? '' : '[]', { status: 200 })
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: '계정 메뉴 열기' }))
    const account = screen.getByRole('region', { name: '로그인과 동기화' })
    await user.type(within(account).getByLabelText('로그인 이메일'), 'me@example.com')
    await user.type(within(account).getByLabelText('로그인 비밀번호'), 'secret1')
    const loginButtons = within(account).getAllByRole('button', { name: '로그인' })
    await user.click(loginButtons[loginButtons.length - 1])

    expect(await within(account).findByText('me@example.com')).toBeInTheDocument()
    expect(within(account).queryByText(/기록 동기화 완료/)).not.toBeInTheDocument()
    expect(within(account).getByRole('button', { name: '지금 동기화' })).toBeInTheDocument()
  })

  it('requires signup consent while keeping location optional', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await user.click(screen.getByRole('button', { name: '계정 메뉴 열기' }))
    const account = screen.getByRole('region', { name: '로그인과 동기화' })
    await user.click(within(account).getByRole('button', { name: '회원가입' }))
    await user.type(within(account).getByLabelText('로그인 이메일'), 'new@example.com')
    await user.type(within(account).getByLabelText('로그인 비밀번호'), 'secret1')
    fetchMock.mockClear()
    await user.click(within(account).getByRole('button', { name: '가입하고 시작' }))

    expect(await within(account).findByText('필수 동의 항목을 모두 확인해 주세요.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(within(account).getByText(/만 14세 이상입니다/))
    await user.click(within(account).getByText(/계정·가계부 기록 수집/))
    await user.click(within(account).getByText(/사진과 촬영·기록 시간/))
    await user.click(within(account).getByRole('button', { name: '가입하고 시작' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { data: Record<string, unknown> }
    expect(body.data.location_consent).toBe(false)
  })

  it('renders the Uichan admin page on /uichan', async () => {
    vi.stubEnv('VITE_PHOTO_ANALYSIS_MODE', 'remote')
    vi.stubEnv('VITE_IMAGE_ANALYSIS_PIPELINE', 'product')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            checkedAt: '2026-07-10T00:00:00.000Z',
            cashlog: {
              supabaseConfigured: true,
              productAnalyzerConfigured: true,
              productAnalyzerOrigin: 'https://catai.example.com',
              visionConfigured: true,
              vercelEnv: 'preview',
            },
            analyzer: {
              status: 'ok',
              httpStatus: 200,
              health: { status: 'ok' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    window.history.pushState({}, '', '/uichan')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '분석 연결 정상' })).toBeInTheDocument()
    expect(screen.getByText('https://catai.example.com')).toBeInTheDocument()
  })
})
