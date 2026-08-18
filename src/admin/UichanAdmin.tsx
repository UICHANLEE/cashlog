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
import { formatCategoryLabel, migrateCategoryId } from '../domain/cashlog'
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
  operationalVersion?: number
  totalEvents?: number
  events24h?: number
  events7d?: number
  activeSessions24h?: number
  signedInUsers7d?: number
  clientErrors24h?: number
  avgDwellMs24h?: number
  engagedViews24h?: number
  avgFirstActionMs24h?: number
  actionClicks24h?: number
  topEvents7d?: Array<{ name: string; count: number }>
  topPaths7d?: Array<{ path: string; count: number }>
  engagement7d?: Array<{
    scope: 'page' | 'view'
    path: string
    view: string
    views: number
    completedViews: number
    avgDwellMs: number
    avgScrollDepthPct: number
    firstActionRate: number
    avgFirstActionMs: number
  }>
  topActions7d?: Array<{ actionId: string; count: number; avgTimeToActionMs: number }>
  analysisAttempts24h?: number
  analysisSucceeded24h?: number
  analysisFailed24h?: number
  analysisAbandoned24h?: number
  analysisPending24h?: number
  analysisCompletionRate24h?: number
  analysisSuccessRate24h?: number
  analysisP50Ms7d?: number
  analysisP95Ms7d?: number
  modelP50Ms7d?: number
  modelP95Ms7d?: number
  avgConfidencePct7d?: number
  feedbackSamples7d?: number
  categoryAcceptanceRate7d?: number
  categoryCorrectionRate7d?: number
  explicitFeedbackSamples7d?: number
  explicitCorrectRate7d?: number
  storyOpens24h?: number
  storyRendered24h?: number
  storyAbandoned24h?: number
  storyRenderRate24h?: number
  storyP50Ms7d?: number
  storyP95Ms7d?: number
  operationBreakdown7d?: Array<{
    operation: string
    count: number
    errors: number
    avgDurationMs: number
    p50DurationMs: number
    p95DurationMs: number
  }>
  modelQuality7d?: Array<{
    model: string
    samples: number
    acceptanceRate: number
    correctionRate: number
    avgConfidencePct: number
  }>
  categoryQuality7d?: Array<{
    suggestedCategory: string
    samples: number
    acceptanceRate: number
    correctionRate: number
  }>
  storyPerformance7d?: Array<{
    storyType: string
    renders: number
    avgDurationMs: number
    p50DurationMs: number
    p95DurationMs: number
    avgSlides: number
  }>
  categoryConfusion7d?: Array<{
    suggestedCategory: string
    selectedCategory: string
    count: number
  }>
  releasePerformance7d?: Array<{
    release: string
    successes: number
    failures: number
    avgDurationMs: number
    p95DurationMs: number
  }>
  analysisFailures7d?: Array<{
    pipeline: string
    model: string
    errorCode: string
    count: number
  }>
  hourlyOperations48h?: Array<{
    bucket: string
    analysisAttempts: number
    analysisSucceeded: number
    analysisFailed: number
    storiesReady: number
    clientErrors: number
  }>
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
  page_duration: '페이지 체류',
  view_opened: '앱 화면 이동',
  view_duration: '앱 화면 체류',
  first_action: '첫 행동',
  action_clicked: '버튼·링크 클릭',
  form_started: '폼 입력 시작',
  form_submitted: '폼 제출',
  account_panel_opened: '계정 메뉴 열기',
  auth_started: '인증 시작',
  auth_succeeded: '인증 성공',
  auth_failed: '인증 실패',
  camera_opened: '카메라 열기',
  media_selected: '사진·영상 선택',
  analysis_started: '사진 분석 시작',
  analysis_succeeded: '사진 분석 성공',
  analysis_failed: '사진 분석 실패',
  analysis_feedback: '카테고리 확인',
  analysis_rating: '추천 직접 평가',
  record_saved: '기록 저장',
  story_opened: '스토리 열기',
  story_rendered: '스토리 표시 완료',
  story_media_ready: '스토리 미디어 준비',
  view_ready: '화면 표시 완료',
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

const formatDuration = (milliseconds?: number) => {
  const value = Math.max(0, Number(milliseconds) || 0)
  if (value < 1_000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}초`
  const minutes = Math.floor(value / 60_000)
  const seconds = Math.round(value % 60_000 / 1_000)
  return `${minutes}분 ${seconds}초`
}

const propertyLabels: Record<string, string> = {
  action_id: '행동',
  action_sequence: '순서',
  action_type: '유형',
  duration_ms: '구간 체류',
  total_duration_ms: '누적 체류',
  time_to_action_ms: '화면 진입 후',
  scroll_depth_pct: '스크롤',
  view: '화면',
  reason: '종료 이유',
  trace_id: '흐름 ID',
  pipeline: '파이프라인',
  model: '모델',
  engine: '엔진',
  suggested_category: '추천 카테고리',
  selected_category: '최종 카테고리',
  operation: '작업',
  confidence_band: '신뢰도 구간',
  server_duration_ms: '서버 처리',
  model_duration_ms: '모델 판독',
  preprocess_duration_ms: '전처리',
  network_duration_ms: '네트워크',
  confidence_pct: '모델 신뢰도',
  payload_kb: '전송 크기',
  item_count: '탐지 항목',
  slide_count: '슬라이드',
  http_status: 'HTTP',
  corrected: '사용자 수정',
  needs_review: '확인 필요',
  release: '배포 버전',
  server_request_id: '서버 요청 ID',
  feedback_source: '평가 방식',
  rating: '직접 평가',
}

const formatProperty = (key: string, value: string | number | boolean) => {
  if (key.endsWith('_ms') && typeof value === 'number') return formatDuration(value)
  if (key === 'scroll_depth_pct') return `${value}%`
  if (key === 'confidence_pct') return `${value}%`
  if (key === 'payload_kb') return `${value}KB`
  if (key === 'corrected' || key === 'needs_review') return value ? '예' : '아니요'
  if ((key === 'suggested_category' || key === 'selected_category') && typeof value === 'string') {
    return formatCategoryLabel(migrateCategoryId(value))
  }
  return String(value)
}

const operationLabels: Record<string, string> = {
  photo_analysis: '사진 카테고리 판독',
  story_render: '스토리 첫 화면',
  story_media_ready: '스토리 미디어 준비',
  view_transition: '앱 화면 이동',
  camera_open: '카메라 열기',
  record_save: '기록 저장',
  category_rating: '카테고리 직접 평가',
}

const storyLabels: Record<string, string> = {
  day: '하루 스토리',
  month: '한 달 스토리',
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
  valueLabel,
}: {
  label: string
  value: number
  detail: string
  tone: 'mint' | 'sun' | 'coral' | 'sky'
  valueLabel?: string
}) {
  return (
    <article className={`admin-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{valueLabel ?? value.toLocaleString('ko-KR')}</strong>
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
  const topActionMax = Math.max(1, ...(summary.topActions7d ?? []).map((item) => item.count))
  const operationalAlerts = [
    (summary.analysisAttempts24h ?? 0) > 0 && Number(summary.analysisCompletionRate24h ?? 0) < 98
      ? `분석 완료율 ${Number(summary.analysisCompletionRate24h ?? 0).toFixed(1)}% · 중도 이탈 ${summary.analysisAbandoned24h ?? 0}건`
      : null,
    (summary.analysisP95Ms7d ?? 0) > 5_000
      ? `사진 판독 P95 ${formatDuration(summary.analysisP95Ms7d)} · 목표 5초 초과`
      : null,
    (summary.storyOpens24h ?? 0) > 0 && Number(summary.storyRenderRate24h ?? 0) < 98
      ? `스토리 미디어 준비율 ${Number(summary.storyRenderRate24h ?? 0).toFixed(1)}%`
      : null,
    (summary.clientErrors24h ?? 0) > 0
      ? `클라이언트 오류 ${summary.clientErrors24h}건`
      : null,
  ].filter((item): item is string => Boolean(item))

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
            민감한 가계부 내용 없이 사용 흐름, 모델 품질, 처리 시간과 오류를 한곳에서 확인합니다.
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

      <section className="admin-metrics admin-behavior-metrics" aria-label="행동 분석 요약">
        <MetricCard label="평균 화면 체류" value={summary.avgDwellMs24h ?? 0} valueLabel={formatDuration(summary.avgDwellMs24h)} detail="실제로 화면이 보인 시간" tone="sky" />
        <MetricCard label="첫 행동까지" value={summary.avgFirstActionMs24h ?? 0} valueLabel={formatDuration(summary.avgFirstActionMs24h)} detail="화면 진입 후 평균" tone="sun" />
        <MetricCard label="버튼·링크 클릭" value={summary.actionClicks24h ?? 0} detail="최근 24시간" tone="mint" />
        <MetricCard label="측정 완료 화면" value={summary.engagedViews24h ?? 0} detail="최근 24시간" tone="coral" />
      </section>

      {summary.operationalVersion !== 2 && (
        <section className="admin-migration-notice" role="status">
          <AlertTriangle size={18} aria-hidden />
          <span><strong>운영 성능 집계 업데이트가 필요해요.</strong> Supabase에서 <code>202608180002_operational_analytics_hardening.sql</code>을 적용해 주세요.</span>
        </section>
      )}

      {operationalAlerts.length > 0 && (
        <section className="admin-alert-strip" aria-label="운영 경고">
          <AlertTriangle size={19} aria-hidden />
          <div>
            <strong>확인이 필요한 지표</strong>
            {operationalAlerts.map((alert) => <span key={alert}>{alert}</span>)}
          </div>
        </section>
      )}

      <section className="admin-metrics" aria-label="사진 분석 운영 성능">
        <MetricCard
          label="분석 성공률"
          value={summary.analysisSuccessRate24h ?? 0}
          valueLabel={`${Number(summary.analysisSuccessRate24h ?? 0).toFixed(1)}%`}
          detail={`24시간 ${summary.analysisSucceeded24h ?? 0}건 성공 · ${summary.analysisFailed24h ?? 0}건 실패`}
          tone="mint"
        />
        <MetricCard
          label="분석 완료율"
          value={summary.analysisCompletionRate24h ?? 0}
          valueLabel={`${Number(summary.analysisCompletionRate24h ?? 0).toFixed(1)}%`}
          detail={`중도 이탈 ${summary.analysisAbandoned24h ?? 0}건 · 진행 중 ${summary.analysisPending24h ?? 0}건`}
          tone="sun"
        />
        <MetricCard label="사진 판독 P50" value={summary.analysisP50Ms7d ?? 0} valueLabel={formatDuration(summary.analysisP50Ms7d)} detail="최근 7일 사용자 체감 중앙값" tone="sky" />
        <MetricCard label="사진 판독 P95" value={summary.analysisP95Ms7d ?? 0} valueLabel={formatDuration(summary.analysisP95Ms7d)} detail="느린 5% 경계" tone="coral" />
        <MetricCard label="모델 판독 P95" value={summary.modelP95Ms7d ?? 0} valueLabel={formatDuration(summary.modelP95Ms7d)} detail="서버가 보고한 모델 처리" tone="sun" />
      </section>

      <section className="admin-metrics" aria-label="모델 품질과 스토리 성능">
        <MetricCard
          label="카테고리 수용률"
          value={summary.categoryAcceptanceRate7d ?? 0}
          valueLabel={`${Number(summary.categoryAcceptanceRate7d ?? 0).toFixed(1)}%`}
          detail={`사용자 확인 기준 · ${summary.feedbackSamples7d ?? 0}건`}
          tone="mint"
        />
        <MetricCard
          label="평균 모델 신뢰도"
          value={summary.avgConfidencePct7d ?? 0}
          valueLabel={`${Number(summary.avgConfidencePct7d ?? 0).toFixed(1)}%`}
          detail="모델 자체 점수이며 실제 정확도와 다름"
          tone="sun"
        />
        <MetricCard
          label="명시적 정답 평가"
          value={summary.explicitCorrectRate7d ?? 0}
          valueLabel={`${Number(summary.explicitCorrectRate7d ?? 0).toFixed(1)}%`}
          detail={`맞아요/다시 고를게요 · ${summary.explicitFeedbackSamples7d ?? 0}건`}
          tone="mint"
        />
        <MetricCard label="스토리 준비 P50" value={summary.storyP50Ms7d ?? 0} valueLabel={formatDuration(summary.storyP50Ms7d)} detail="버튼부터 첫 미디어 준비까지" tone="sky" />
        <MetricCard
          label="스토리 표시 완료율"
          value={summary.storyRenderRate24h ?? 0}
          valueLabel={`${Number(summary.storyRenderRate24h ?? 0).toFixed(1)}%`}
          detail={`24시간 ${summary.storyRendered24h ?? 0}/${summary.storyOpens24h ?? 0}회 · 이탈 ${summary.storyAbandoned24h ?? 0}`}
          tone="coral"
        />
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

        <article className="admin-card admin-card-wide admin-operation-card">
          <div className="section-heading">
            <p className="eyebrow">Operations · 7 days</p>
            <h2>기능별 처리 시간</h2>
            <p>사용자가 기능을 누른 순간부터 결과가 보이거나 저장될 때까지 측정합니다.</p>
          </div>
          <div className="admin-data-table admin-operation-table" role="table" aria-label="최근 7일 기능별 처리 시간">
            <div className="admin-data-head" role="row">
              <span role="columnheader">작업</span>
              <span role="columnheader">표본</span>
              <span role="columnheader">평균</span>
              <span role="columnheader">P50</span>
              <span role="columnheader">P95</span>
              <span role="columnheader">오류</span>
            </div>
            {(summary.operationBreakdown7d ?? []).map((item) => (
              <div className="admin-data-row" role="row" key={item.operation}>
                <strong role="cell">{operationLabels[item.operation] ?? item.operation}</strong>
                <span role="cell">{item.count.toLocaleString('ko-KR')}건</span>
                <span role="cell">{formatDuration(item.avgDurationMs)}</span>
                <span role="cell">{formatDuration(item.p50DurationMs)}</span>
                <span role="cell">{formatDuration(item.p95DurationMs)}</span>
                <span role="cell" className={item.errors > 0 ? 'admin-danger-value' : ''}>{item.errors.toLocaleString('ko-KR')}건</span>
              </div>
            ))}
            {(summary.operationBreakdown7d ?? []).length === 0 && <p className="admin-empty">운영 이벤트가 쌓이면 기능별 시간이 표시됩니다.</p>}
          </div>
        </article>

        <article className="admin-card admin-quality-card">
          <div className="section-heading">
            <p className="eyebrow">Model quality · 7 days</p>
            <h2>모델별 사용자 확인 결과</h2>
            <p>실제 정답지가 아니라, 추천 카테고리를 사용자가 그대로 저장했는지 보여줍니다.</p>
          </div>
          <div className="admin-quality-list">
            {(summary.modelQuality7d ?? []).map((item) => (
              <div key={item.model}>
                <strong title={item.model}>{item.model}</strong>
                <span>수용 {Number(item.acceptanceRate).toFixed(1)}%</span>
                <span>수정 {Number(item.correctionRate).toFixed(1)}%</span>
                <small>{item.samples}건 · 신뢰도 {Number(item.avgConfidencePct).toFixed(1)}%</small>
              </div>
            ))}
            {(summary.modelQuality7d ?? []).length === 0 && <p className="admin-empty">카테고리를 확인해 저장한 표본이 아직 없어요.</p>}
          </div>
        </article>

        <article className="admin-card admin-quality-card">
          <div className="section-heading">
            <p className="eyebrow">Category quality · 7 days</p>
            <h2>카테고리별 수정률</h2>
          </div>
          <div className="admin-quality-list">
            {(summary.categoryQuality7d ?? []).map((item) => (
              <div key={item.suggestedCategory}>
                <strong>{formatCategoryLabel(migrateCategoryId(item.suggestedCategory))}</strong>
                <span>수용 {Number(item.acceptanceRate).toFixed(1)}%</span>
                <span>수정 {Number(item.correctionRate).toFixed(1)}%</span>
                <small>{item.samples}건</small>
              </div>
            ))}
            {(summary.categoryQuality7d ?? []).length === 0 && <p className="admin-empty">카테고리 확인 표본이 쌓이면 여기에 표시됩니다.</p>}
          </div>
        </article>

        <article className="admin-card admin-quality-card">
          <div className="section-heading">
            <p className="eyebrow">Category confusion · 7 days</p>
            <h2>자주 다시 고른 카테고리</h2>
          </div>
          <div className="admin-quality-list admin-confusion-list">
            {(summary.categoryConfusion7d ?? []).map((item) => (
              <div key={`${item.suggestedCategory}:${item.selectedCategory}`}>
                <strong>{formatCategoryLabel(migrateCategoryId(item.suggestedCategory))}</strong>
                <span aria-hidden>→</span>
                <span>{formatCategoryLabel(migrateCategoryId(item.selectedCategory))}</span>
                <small>{item.count}건</small>
              </div>
            ))}
            {(summary.categoryConfusion7d ?? []).length === 0 && <p className="admin-empty">수정된 카테고리 조합이 아직 없어요.</p>}
          </div>
        </article>

        <article className="admin-card admin-quality-card">
          <div className="section-heading">
            <p className="eyebrow">Failures · 7 days</p>
            <h2>분석 실패 원인</h2>
          </div>
          <div className="admin-quality-list">
            {(summary.analysisFailures7d ?? []).map((item) => (
              <div key={`${item.pipeline}:${item.model}:${item.errorCode}`}>
                <strong>{item.errorCode}</strong>
                <span>{item.pipeline}</span>
                <small>{item.model} · {item.count}건</small>
              </div>
            ))}
            {(summary.analysisFailures7d ?? []).length === 0 && <p className="admin-empty">최근 분석 실패가 없어요.</p>}
          </div>
        </article>

        <article className="admin-card admin-card-wide admin-operation-card">
          <div className="section-heading">
            <p className="eyebrow">Release performance · 7 days</p>
            <h2>배포 버전별 판독 성능</h2>
          </div>
          <div className="admin-data-table admin-release-table" role="table" aria-label="배포 버전별 분석 성능">
            <div className="admin-data-head" role="row">
              <span role="columnheader">버전</span><span role="columnheader">성공</span><span role="columnheader">실패</span><span role="columnheader">평균</span><span role="columnheader">P95</span>
            </div>
            {(summary.releasePerformance7d ?? []).map((item) => (
              <div className="admin-data-row" role="row" key={item.release}>
                <strong role="cell" title={item.release}>{item.release.slice(0, 12)}</strong>
                <span role="cell">{item.successes}건</span>
                <span role="cell" className={item.failures > 0 ? 'admin-danger-value' : ''}>{item.failures}건</span>
                <span role="cell">{formatDuration(item.avgDurationMs)}</span>
                <span role="cell">{formatDuration(item.p95DurationMs)}</span>
              </div>
            ))}
            {(summary.releasePerformance7d ?? []).length === 0 && <p className="admin-empty">새 버전 이벤트가 쌓이면 비교할 수 있어요.</p>}
          </div>
        </article>

        <article className="admin-card admin-card-wide admin-operation-card">
          <div className="section-heading">
            <p className="eyebrow">Hourly operations · 48 hours</p>
            <h2>시간대별 운영 추이</h2>
          </div>
          <div className="admin-data-table admin-hourly-table" role="table" aria-label="최근 48시간 운영 추이">
            <div className="admin-data-head" role="row">
              <span role="columnheader">시간</span><span role="columnheader">시도</span><span role="columnheader">성공</span><span role="columnheader">실패</span><span role="columnheader">스토리</span><span role="columnheader">앱 오류</span>
            </div>
            {(summary.hourlyOperations48h ?? []).map((item) => (
              <div className="admin-data-row" role="row" key={item.bucket}>
                <strong role="cell">{new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit' }).format(new Date(item.bucket))}</strong>
                <span role="cell">{item.analysisAttempts}</span>
                <span role="cell">{item.analysisSucceeded}</span>
                <span role="cell" className={item.analysisFailed > 0 ? 'admin-danger-value' : ''}>{item.analysisFailed}</span>
                <span role="cell">{item.storiesReady}</span>
                <span role="cell" className={item.clientErrors > 0 ? 'admin-danger-value' : ''}>{item.clientErrors}</span>
              </div>
            ))}
            {(summary.hourlyOperations48h ?? []).length === 0 && <p className="admin-empty">시간대별 이벤트가 아직 없어요.</p>}
          </div>
        </article>

        <article className="admin-card admin-card-wide admin-operation-card">
          <div className="section-heading">
            <p className="eyebrow">Story performance · 7 days</p>
            <h2>하루·한 달 스토리 표시 시간</h2>
          </div>
          <div className="admin-data-table admin-story-table" role="table" aria-label="최근 7일 스토리 표시 시간">
            <div className="admin-data-head" role="row">
              <span role="columnheader">스토리</span>
              <span role="columnheader">표시</span>
              <span role="columnheader">평균</span>
              <span role="columnheader">P50</span>
              <span role="columnheader">P95</span>
              <span role="columnheader">평균 장수</span>
            </div>
            {(summary.storyPerformance7d ?? []).map((item) => (
              <div className="admin-data-row" role="row" key={item.storyType}>
                <strong role="cell">{storyLabels[item.storyType] ?? item.storyType}</strong>
                <span role="cell">{item.renders.toLocaleString('ko-KR')}회</span>
                <span role="cell">{formatDuration(item.avgDurationMs)}</span>
                <span role="cell">{formatDuration(item.p50DurationMs)}</span>
                <span role="cell">{formatDuration(item.p95DurationMs)}</span>
                <span role="cell">{item.avgSlides}장</span>
              </div>
            ))}
            {(summary.storyPerformance7d ?? []).length === 0 && <p className="admin-empty">스토리를 열면 실제 표시 시간이 쌓입니다.</p>}
          </div>
        </article>

        <article className="admin-card admin-card-wide admin-engagement-card">
          <div className="section-heading">
            <p className="eyebrow">Engagement</p>
            <h2>화면별 체류와 첫 행동</h2>
            <p>브라우저에서 실제로 화면이 보인 시간만 합산합니다.</p>
          </div>
          <div className="admin-engagement-table" role="table" aria-label="최근 7일 화면별 행동 지표">
            <div className="admin-engagement-head" role="row">
              <span role="columnheader">화면</span>
              <span role="columnheader">방문</span>
              <span role="columnheader">평균 체류</span>
              <span role="columnheader">첫 행동률</span>
              <span role="columnheader">첫 행동까지</span>
              <span role="columnheader">스크롤</span>
            </div>
            {(summary.engagement7d ?? []).map((item) => (
              <div className="admin-engagement-row" role="row" key={`${item.scope}:${item.path}:${item.view}`}>
                <strong role="cell"><small>{item.scope === 'page' ? '페이지' : '앱 화면'}</small>{item.view}<em>{item.path}</em></strong>
                <span role="cell">{item.views.toLocaleString('ko-KR')}<small>완료 {item.completedViews}</small></span>
                <span role="cell">{formatDuration(item.avgDwellMs)}</span>
                <span role="cell">{Number(item.firstActionRate).toFixed(1)}%</span>
                <span role="cell">{formatDuration(item.avgFirstActionMs)}</span>
                <span role="cell">{item.avgScrollDepthPct}%</span>
              </div>
            ))}
            {(summary.engagement7d ?? []).length === 0 && <p className="admin-empty">화면 체류 데이터가 쌓이면 여기에 표시됩니다.</p>}
          </div>
        </article>

        <article className="admin-card">
          <div className="section-heading">
            <p className="eyebrow">Top actions</p>
            <h2>많이 누른 버튼</h2>
          </div>
          <div className="admin-breakdown admin-action-breakdown">
            {(summary.topActions7d ?? []).map((item) => (
              <div key={item.actionId}>
                <span title={item.actionId}>{item.actionId}</span>
                <i aria-hidden><b style={{ width: `${Math.max(4, item.count / topActionMax * 100)}%` }} /></i>
                <strong>{item.count.toLocaleString('ko-KR')}<small>{formatDuration(item.avgTimeToActionMs)}</small></strong>
              </div>
            ))}
            {(summary.topActions7d ?? []).length === 0 && <p className="admin-empty">아직 버튼 클릭이 없어요.</p>}
          </div>
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
                  {Object.entries(event.properties).map(([key, value]) => <span key={key}>{propertyLabels[key] ?? key}: {formatProperty(key, value)}</span>)}
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
