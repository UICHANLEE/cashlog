import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  LogIn,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'
import { CatDoodle, DogDoodle } from '../components/Doodles'
import { getSupabaseConfig } from '../services/supabaseConfig'

type StatusResponse = {
  checkedAt?: string
  cashlog?: {
    nodeEnv?: string
    vercelEnv?: string | null
    supabaseConfigured?: boolean
    productAnalyzerConfigured?: boolean
    productAnalyzerOrigin?: string | null
    productAnalyzerSecured?: boolean
    productAnalyzerAuthMode?: 'none' | 'api_key' | 'cloudflare_access' | 'api_key+cloudflare_access'
    openAiConfigured?: boolean
    visionConfigured?: boolean
  }
  analyzer?: {
    status?: 'ok' | 'error' | 'not_configured'
    httpStatus?: number | null
    error?: string
    health?: unknown
  }
}

type EventSummary = {
  totalEvents?: number
  events24h?: number
  events7d?: number
  activeSessions24h?: number
  signedInUsers7d?: number
  clientErrors24h?: number
  topEvents7d?: Array<{ name: string; count: number }>
  topPaths7d?: Array<{ path: string; count: number }>
}

type UserEvent = {
  id: string
  userId: string | null
  sessionId: string
  name: string
  path: string
  properties: Record<string, string | number | boolean>
  occurredAt: string
  receivedAt: string
}

type EventsResponse = {
  checkedAt?: string
  summary?: EventSummary
  total?: number
  limit?: number
  offset?: number
  events?: UserEvent[]
}

type AccessState = 'loading' | 'allowed' | 'login' | 'forbidden' | 'error'
type Period = '24h' | '7d' | '30d' | 'all'

const eventLabels: Record<string, string> = {
  page_view: '페이지 방문',
  view_opened: '앱 화면 이동',
  account_panel_opened: '계정 메뉴 열기',
  auth_started: '인증 시작',
  auth_succeeded: '인증 성공',
  auth_failed: '인증 실패',
  camera_opened: '카메라 열기',
  media_selected: '사진·영상 선택',
  analysis_started: '사진 분석 시작',
  analysis_succeeded: '사진 분석 성공',
  analysis_failed: '사진 분석 실패',
  record_saved: '기록 저장',
  story_opened: '스토리 열기',
  pet_interacted: '캐릭터 상호작용',
  pet_customized: '캐릭터 꾸미기',
  reservation_submitted: '사전예약 제출',
  profile_updated: '프로필 수정',
  password_reset_requested: '재설정 요청',
  password_changed: '비밀번호 변경',
  account_deleted: '회원탈퇴',
  client_error: '클라이언트 오류',
}

const statusLabel = (ok: boolean) => (ok ? '정상' : '확인 필요')
const statusClass = (ok: boolean) => `admin-status-pill ${ok ? 'ok' : 'warn'}`

const formatCheckedAt = (raw?: string) => {
  if (!raw) return '아직 확인 전'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

const formatEventTime = (raw: string) => {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

const sinceFor = (period: Period) => {
  if (period === 'all') return undefined
  const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : 24 * 30
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

class AdminApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const requestAdmin = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const body = await response.json().catch(() => ({})) as T & { message?: string }
  if (!response.ok) {
    throw new AdminApiError(response.status, body.message || `관리 API 응답 실패 (${response.status})`)
  }
  return body
}

function AdminRow({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div className="admin-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <em className={statusClass(ok)}>{statusLabel(ok)}</em>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: number
  detail: string
  tone: 'mint' | 'sun' | 'coral' | 'sky'
}) {
  return (
    <article className={`admin-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString('ko-KR')}</strong>
      <small>{detail}</small>
    </article>
  )
}

export function UichanAdmin() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [events, setEvents] = useState<UserEvent[]>([])
  const [summary, setSummary] = useState<EventSummary>({})
  const [total, setTotal] = useState(0)
  const [eventName, setEventName] = useState('')
  const [period, setPeriod] = useState<Period>('7d')
  const [access, setAccess] = useState<AccessState>('loading')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const supabaseConfig = useMemo(() => getSupabaseConfig(), [])
  const imageMode = import.meta.env.VITE_PHOTO_ANALYSIS_MODE ?? 'mock'
  const pipeline = import.meta.env.VITE_IMAGE_ANALYSIS_PIPELINE ?? 'receipt'
  const imageApiUrl = import.meta.env.VITE_ANALYZE_IMAGE_API_URL ?? '/api/analyze-image'

  const handleAdminError = useCallback((reason: unknown) => {
    const apiError = reason instanceof AdminApiError ? reason : null
    if (apiError?.status === 401) setAccess('login')
    else if (apiError?.status === 403) setAccess('forbidden')
    else {
      setAccess('error')
      setError(reason instanceof Error ? reason.message : '관리 상태를 확인할 수 없어요.')
    }
  }, [])

  const loadEvents = useCallback(async (offset = 0) => {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) })
    if (eventName) params.set('eventName', eventName)
    const since = sinceFor(period)
    if (since) params.set('since', since)
    const body = await requestAdmin<EventsResponse>(`/api/uichan/events?${params}`)
    setSummary(body.summary ?? {})
    setTotal(body.total ?? 0)
    setEvents((current) => offset > 0 ? [...current, ...(body.events ?? [])] : (body.events ?? []))
  }, [eventName, period])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextStatus] = await Promise.all([
        requestAdmin<StatusResponse>('/api/uichan/status'),
        loadEvents(0),
      ])
      setStatus(nextStatus)
      setAccess('allowed')
    } catch (reason) {
      setStatus(null)
      setEvents([])
      handleAdminError(reason)
    } finally {
      setLoading(false)
    }
  }, [handleAdminError, loadEvents])

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const analyzerOk = status?.analyzer?.status === 'ok'
  const productReady =
    imageMode === 'remote' &&
    pipeline === 'product' &&
    Boolean(status?.cashlog?.productAnalyzerConfigured) &&
    analyzerOk
  const topEventMax = Math.max(1, ...(summary.topEvents7d ?? []).map((item) => item.count))

  if (access !== 'allowed' && !loading) {
    const needsLogin = access === 'login'
    const forbidden = access === 'forbidden'
    return (
      <main className="app-shell admin-shell">
        <section className="admin-access-card" role="alert">
          {needsLogin ? <LogIn size={34} aria-hidden /> : forbidden ? <ShieldCheck size={34} aria-hidden /> : <AlertTriangle size={34} aria-hidden />}
          <p className="eyebrow">Uichan admin</p>
          <h1>{needsLogin ? '관리자 로그인이 필요해요' : forbidden ? '관리자 계정이 아니에요' : '관리 화면을 열지 못했어요'}</h1>
          <p>{needsLogin
            ? 'CASHLOG_ADMIN_EMAILS에 등록한 계정으로 로그인한 뒤 다시 들어와 주세요.'
            : forbidden
              ? '현재 로그인 계정은 사용 로그를 조회할 권한이 없습니다.'
              : error || '환경변수와 Supabase 마이그레이션을 확인해 주세요.'}</p>
          {needsLogin
            ? <a className="primary-button" href="/login.html?returnTo=%2Fuichan">관리자 로그인</a>
            : <button type="button" className="primary-button" onClick={refresh}>다시 확인</button>}
          <a className="ghost-button admin-home-link" href="/">앱으로 돌아가기</a>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell admin-shell">
      <section className="hero-panel admin-hero">
        <div>
          <p className="eyebrow">Uichan admin</p>
          <h1>Cashlog</h1>
          <p className="hero-copy">
            민감한 가계부 내용 없이 사용 흐름, 오류, 연결 상태를 한곳에서 확인합니다.
          </p>
          <div className="hero-mascots" aria-hidden="true">
            <CatDoodle className="mascot mascot-cat" />
            <DogDoodle className="mascot mascot-dog" />
            <span className="mascot-caption">운영 로그 점검</span>
          </div>
        </div>
        <div className="hero-actions">
          <section className="account-card admin-summary-card" aria-label="관리자 상태 요약">
            <p className="eyebrow">Status</p>
            <h2>{productReady ? '서비스 연결 정상' : '일부 점검 필요'}</h2>
            <p>마지막 확인: {formatCheckedAt(status?.checkedAt)}</p>
            <button type="button" className="primary-button" onClick={refresh} disabled={loading}>
              <RefreshCw size={17} aria-hidden className={loading ? 'spin' : ''} />
              {loading ? '확인 중...' : '전체 새로고침'}
            </button>
            <a className="ghost-button admin-home-link" href="/">앱으로 돌아가기</a>
          </section>
        </div>
      </section>

      <section className="admin-metrics" aria-label="사용 로그 요약">
        <MetricCard label="최근 24시간 이벤트" value={summary.events24h ?? 0} detail="허용된 행동 이벤트" tone="mint" />
        <MetricCard label="활성 세션" value={summary.activeSessions24h ?? 0} detail="24시간 익명 세션" tone="sun" />
        <MetricCard label="로그인 사용자" value={summary.signedInUsers7d ?? 0} detail="최근 7일 고유 계정" tone="sky" />
        <MetricCard label="클라이언트 오류" value={summary.clientErrors24h ?? 0} detail="최근 24시간" tone="coral" />
      </section>

      <section className="admin-grid" aria-label="연결 상태">
        <article className="admin-card">
          <div className="section-heading">
            <p className="eyebrow">Frontend</p>
            <h2>앱 설정</h2>
          </div>
          <AdminRow label="사진 분석 모드" value={imageMode} ok={imageMode === 'remote'} />
          <AdminRow label="분석 파이프라인" value={pipeline} ok={pipeline === 'product'} />
          <AdminRow label="이미지 API 경로" value={imageApiUrl} ok={imageApiUrl.includes('/api/analyze-image')} />
          <AdminRow label="Supabase 공개 설정" value={supabaseConfig ? supabaseConfig.url : '미설정'} ok={Boolean(supabaseConfig)} />
        </article>

        <article className="admin-card">
          <div className="section-heading">
            <p className="eyebrow">Server</p>
            <h2>배포 환경</h2>
          </div>
          <AdminRow label="Supabase 서버 설정" value={status?.cashlog?.supabaseConfigured ? '설정됨' : '미설정'} ok={Boolean(status?.cashlog?.supabaseConfigured)} />
          <AdminRow label="상품 분석 서버" value={status?.cashlog?.productAnalyzerOrigin ?? '미설정'} ok={Boolean(status?.cashlog?.productAnalyzerConfigured)} />
          <AdminRow label="서버 간 인증" value={status?.cashlog?.productAnalyzerAuthMode ?? '미설정'} ok={Boolean(status?.cashlog?.productAnalyzerSecured)} />
          <AdminRow label="Vision fallback" value={status?.cashlog?.visionConfigured ? '설정됨' : '미설정'} ok={Boolean(status?.cashlog?.visionConfigured)} />
          <AdminRow label="Vercel 환경" value={status?.cashlog?.vercelEnv ?? status?.cashlog?.nodeEnv ?? 'unknown'} ok={Boolean(status?.cashlog)} />
        </article>

        <article className="admin-card">
          <div className="section-heading">
            <p className="eyebrow">Top events</p>
            <h2>최근 7일 행동</h2>
          </div>
          <div className="admin-breakdown">
            {(summary.topEvents7d ?? []).map((item) => (
              <div key={item.name}>
                <span>{eventLabels[item.name] ?? item.name}</span>
                <i aria-hidden><b style={{ width: `${Math.max(4, item.count / topEventMax * 100)}%` }} /></i>
                <strong>{item.count.toLocaleString('ko-KR')}</strong>
              </div>
            ))}
            {(summary.topEvents7d ?? []).length === 0 && <p className="admin-empty">아직 쌓인 이벤트가 없어요.</p>}
          </div>
        </article>

        <article className="admin-card">
          <div className="section-heading">
            <p className="eyebrow">Analyzer</p>
            <h2>Catai FastAPI</h2>
          </div>
          <AdminRow label="Health" value={status?.analyzer?.status ?? '확인 전'} ok={analyzerOk} />
          <AdminRow label="HTTP" value={status?.analyzer?.httpStatus ? String(status.analyzer.httpStatus) : '-'} ok={analyzerOk} />
          {status?.analyzer?.error && <p className="admin-error">{status.analyzer.error}</p>}
          <pre className="admin-json">{JSON.stringify(status?.analyzer?.health ?? status, null, 2)}</pre>
        </article>

        <article className="admin-card admin-card-wide admin-event-card">
          <div className="section-heading admin-log-heading">
            <div>
              <p className="eyebrow">Product events</p>
              <h2>사용자 활동 로그</h2>
              <p>금액, 메모, 사진, 위치, 이메일, 토큰은 수집하지 않습니다.</p>
            </div>
            <div className="admin-log-count"><Activity size={17} aria-hidden /><strong>{total.toLocaleString('ko-KR')}</strong><span>건</span></div>
          </div>
          <div className="admin-log-filters">
            <label>
              <span>기간</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
                <option value="24h">최근 24시간</option>
                <option value="7d">최근 7일</option>
                <option value="30d">최근 30일</option>
                <option value="all">전체</option>
              </select>
            </label>
            <label>
              <span>이벤트</span>
              <select value={eventName} onChange={(event) => setEventName(event.target.value)}>
                <option value="">모든 이벤트</option>
                {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" className="ghost-button" onClick={() => void loadEvents(0)} disabled={loading}>필터 적용</button>
          </div>

          <div className="admin-event-list" role="list" aria-label="사용자 활동 이벤트">
            {events.map((event) => (
              <article key={event.id} className={`admin-event-row${event.name.includes('failed') || event.name === 'client_error' ? ' is-error' : ''}`} role="listitem">
                <div className="admin-event-main">
                  <strong>{eventLabels[event.name] ?? event.name}</strong>
                  <span>{event.path}</span>
                </div>
                <time dateTime={event.occurredAt}>{formatEventTime(event.occurredAt)}</time>
                <div className="admin-event-identity">
                  {event.userId ? <><UserRoundCheck size={14} aria-hidden />계정 {event.userId.slice(0, 8)}</> : <>익명 {event.sessionId}</>}
                </div>
                <div className="admin-event-properties">
                  {Object.entries(event.properties).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
                  {Object.keys(event.properties).length === 0 && <span>추가 속성 없음</span>}
                </div>
              </article>
            ))}
            {!loading && events.length === 0 && <div className="admin-empty-state"><Activity size={30} aria-hidden /><strong>조건에 맞는 로그가 없어요</strong><span>앱에서 기능을 사용하면 이벤트가 여기에 쌓입니다.</span></div>}
          </div>
          {events.length < total && (
            <button type="button" className="ghost-button admin-load-more" onClick={() => void loadEvents(events.length)} disabled={loading}>
              다음 50개 불러오기
            </button>
          )}
          {error && <p className="admin-error">{error}</p>}
        </article>
      </section>
    </main>
  )
}
