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
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shows disabled story playback until any entries exist', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /하루 스토리/i })).toBeDisabled()
    expect(screen.getByText('선택한 날짜에 기록을 하나 남기면 하루 스토리가 열려요.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /영수증 찍으면/ })).toBeInTheDocument()
    expect(screen.queryByText('총 지출 0원')).not.toBeInTheDocument()
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
    expect(within(account).getByRole('checkbox', { name: /이용약관/ })).toBeInTheDocument()
  })

  it('keeps the pet playground behind a dedicated tab', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText(/함께 쓰는 가계부/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '하루 타임라인' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '나비' }))

    expect(await screen.findByText(/나비와 함께 쓰는 가계부/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '나비' })).toHaveAttribute('aria-pressed', 'true')

    const petStages = await screen.findAllByRole('button', { name: /나비 캐릭터\. 누르면 다정하게 인사해요/ })
    await user.click(petStages[petStages.length - 1])
    expect(await screen.findByText('나비가 눈을 가늘게 뜨고 기대요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /초코 캐릭터.*강아지.*말티즈/ }))
    expect(await screen.findAllByRole('button', { name: /초코 캐릭터\. 누르면 다정하게 인사해요/ })).toHaveLength(1)
  })

  it('applies and remembers Nabi wardrobe and color choices', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '나비' }))
    const hoodie = await screen.findByRole('button', { name: '나비 말랑 후디 옷' })
    await user.click(hoodie)
    expect(hoodie).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('나비 현재 스타일')).toHaveTextContent('말랑 후디')
    expect(screen.getByLabelText('말랑 후디 착용 중')).toBeInTheDocument()

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

    await user.click(screen.getByRole('button', { name: /하루 스토리/i }))
    const dialog = await screen.findByRole('dialog', { name: /스토리/ })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/의 하루/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '다음 장' }))
    expect(await within(dialog).findByText('오늘의 카페')).toBeInTheDocument()
  })

  it('lets a user add a manual expense without a photo', async () => {
    const user = userEvent.setup()
    render(<App />)

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

  it('moves keyboard focus into the entry dialog and restores it after Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    const trigger = screen.getByRole('button', { name: '직접 입력' })

    await user.click(trigger)
    expect(await screen.findByRole('button', { name: '기록 창 닫기' })).toHaveFocus()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '기록 추가' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('opens the monthly story from the calendar when a photo record exists', async () => {
    const user = userEvent.setup()
    const expense = createExpenseFromAnalysis({
      analysis: {
        suggestedAmount: 8200,
        suggestedCategory: 'meal_cafe',
        suggestedTitle: '이번 달 카페',
        suggestedMemo: '',
        confidence: 0.88,
        rawText: '',
      },
      imageUrl: 'blob:cashlog-photo',
      dateTime: new Date().toISOString(),
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([expense]))
    render(<App />)

    await user.click(screen.getByRole('button', { name: '달력' }))
    const monthStory = await screen.findByRole('button', { name: '한 달 스토리' })
    expect(monthStory).toBeEnabled()
    await user.click(monthStory)

    expect(await screen.findByRole('dialog', { name: /월 기록/ })).toBeInTheDocument()
  })

  it('renders a real 404 for an unknown address', () => {
    history.replaceState(null, '', '/definitely-not-a-cashlog-page')
    render(<App />)
    expect(screen.getByRole('heading', { name: '여긴 기록장이 아니에요' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cashlog 홈으로' })).toHaveAttribute('href', '/')
  })

  it('keeps photo picking separate from the long expense form', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '가입 없이 3초 만에 영수증 기록하기' }))

    expect(screen.getByRole('heading', { name: '사진으로 기록' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카메라 촬영' })).toBeInTheDocument()
    expect(screen.getByLabelText('갤러리에서 미디어 선택')).toBeInTheDocument()
    expect(screen.queryByLabelText('금액')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 장면으로 저장' })).not.toBeInTheDocument()
  })

  it('keeps the live camera controls in a dedicated single-screen stage', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const stop = vi.fn()
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    } as unknown as MediaStream))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      mediaDevices: { getUserMedia },
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: '가입 없이 3초 만에 영수증 기록하기' }))

    expect(await screen.findByRole('heading', { name: '장면 촬영' })).toBeInTheDocument()
    expect(document.querySelector('.add-sheet')).toHaveClass('is-camera-live')
    expect(screen.getByRole('button', { name: '촬영하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카메라 끄기' })).toBeInTheDocument()
    expect(screen.queryByLabelText('금액')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 장면으로 저장' })).not.toBeInTheDocument()
  })

  it('does not request location when the account has not consented', async () => {
    const user = userEvent.setup()
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: { getCurrentPosition },
    })
    render(<App />)
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'cafe.jpg', {
      type: 'image/jpeg',
    })

    await user.upload(screen.getByLabelText('갤러리에서 사진 선택'), photo)

    expect(await screen.findByText('위치 저장 꺼짐')).toBeInTheDocument()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('automatically stores current location for a consented photo record', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://cashlog.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    localStorage.setItem('cashlog.supabase.session', JSON.stringify({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'user-1', email: 'me@example.com' },
    }))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/session') {
        return new Response(JSON.stringify({
          success: true,
          accessToken: 'rotated-access-token',
          expiresIn: 3600,
          user: { id: 'user-1', email: 'me@example.com' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/rest/v1/cashlog_user_consents')) {
        return new Response(JSON.stringify([{
          consent_version: '2026-07-26',
          age_14_or_older: true,
          privacy_consent: true,
          photo_time_consent: true,
          location_consent: true,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/rest/v1/cashlog_entries') || url.includes('/rest/v1/cashlog_pet_profiles')) {
        return new Response(init?.method === 'POST' ? '' : '[]', { status: 200 })
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 37.5665,
          longitude: 126.978,
          accuracy: 24,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: { getCurrentPosition },
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: '계정 메뉴 열기' }))
    const account = screen.getByRole('region', { name: '로그인과 동기화' })
    expect(await within(account).findByRole('checkbox', { name: /사진 위치 자동 기록/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '계정 메뉴 닫기' }))

    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'cafe.jpg', {
      type: 'image/jpeg',
    })
    await user.upload(screen.getByLabelText('갤러리에서 사진 선택'), photo)

    expect(await screen.findByText(/현재 위치를 자동으로 넣었어요/)).toBeInTheDocument()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(screen.getByText('위치 포함')).toBeInTheDocument()
  })

  it('keeps model-improvement image retention out of the quick entry flow', async () => {
    const user = userEvent.setup()
    render(<App />)
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'cafe.jpg', {
      type: 'image/jpeg',
    })

    await user.upload(screen.getByLabelText('갤러리에서 사진 선택'), photo)

    await screen.findByText(/아래 내용만 확인하면 저장돼요/)
    expect(screen.queryByRole('checkbox', {
      name: /추천 품질 개선을 위한 학습·평가 후보로 보관/,
    })).not.toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: /하루 스토리/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /하루 스토리/i }))
    const dialog = screen.getByRole('dialog', { name: /스토리/ })
    expect(within(dialog).getByText(/의 하루/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '다음 장' }))
    expect(await within(dialog).findByText('메모만')).toBeInTheDocument()
  })

  it('lets a user add manual income via 수입 toggle', async () => {
    const user = userEvent.setup()
    render(<App />)

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
        if (url === '/api/auth/session') {
          return new Response(JSON.stringify({
            success: true,
            accessToken: 'rotated-access-token',
            expiresIn: 3600,
            user: { id: 'user-1', email: 'me@example.com' },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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

    await user.click(within(account).getByRole('checkbox', { name: /만 14세 이상입니다/ }))
    await user.click(within(account).getByRole('checkbox', { name: /이용약관/ }))
    await user.click(within(account).getByRole('checkbox', { name: /개인정보 처리방침/ }))
    await user.click(within(account).getByRole('checkbox', { name: /선택한 사진과 사진 파일·기록 시각/ }))
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
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        const body = path.includes('/api/uichan/events')
          ? {
              checkedAt: '2026-08-03T00:00:00.000Z',
              summary: {
                events24h: 12,
                activeSessions24h: 3,
                signedInUsers7d: 2,
                clientErrors24h: 0,
                topEvents7d: [{ name: 'page_view', count: 6 }],
              },
              total: 1,
              events: [{
                id: 'event-1',
                userId: null,
                sessionId: 'session123456',
                name: 'page_view',
                path: '/',
                properties: { device: 'mobile' },
                occurredAt: '2026-08-03T00:00:00.000Z',
                receivedAt: '2026-08-03T00:00:01.000Z',
              }],
            }
          : {
            checkedAt: '2026-07-10T00:00:00.000Z',
            cashlog: {
              supabaseConfigured: true,
              productAnalyzerConfigured: true,
              productAnalyzerOrigin: 'https://catai.example.com',
              productAnalyzerSecured: true,
              productAnalyzerAuthMode: 'api_key',
              visionConfigured: true,
              vercelEnv: 'preview',
            },
            analyzer: {
              status: 'ok',
              httpStatus: 200,
              health: { status: 'ok' },
            },
          }
        return new Response(
          JSON.stringify(body),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )
    window.history.pushState({}, '', '/uichan')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '서비스 연결 정상' })).toBeInTheDocument()
    expect(screen.getByText('https://catai.example.com')).toBeInTheDocument()
    expect(screen.getByText('사용자 활동 로그')).toBeInTheDocument()
    expect(screen.getAllByText('페이지 방문').length).toBeGreaterThan(0)
  })

  it('requires a login before showing Uichan activity logs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: '로그인이 필요해요.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))
    window.history.pushState({}, '', '/uichan')

    render(<App />)

    expect(await screen.findByRole('heading', { name: '관리자 로그인이 필요해요' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '관리자 로그인' })).toHaveAttribute(
      'href',
      '/login.html?returnTo=%2Fuichan',
    )
    expect(screen.queryByText('사용자 활동 로그')).not.toBeInTheDocument()
  })
})
