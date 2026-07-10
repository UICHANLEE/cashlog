import { useCallback, useEffect, useMemo, useState } from 'react'
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

export function UichanAdmin() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabaseConfig = useMemo(() => getSupabaseConfig(), [])
  const imageMode = import.meta.env.VITE_PHOTO_ANALYSIS_MODE ?? 'mock'
  const pipeline = import.meta.env.VITE_IMAGE_ANALYSIS_PIPELINE ?? 'receipt'
  const imageApiUrl = import.meta.env.VITE_ANALYZE_IMAGE_API_URL ?? '/api/analyze-image'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/uichan/status', {
        headers: { Accept: 'application/json' },
      })
      const body = (await response.json()) as StatusResponse
      if (!response.ok) {
        throw new Error(`관리 API 응답 실패 (${response.status})`)
      }
      setStatus(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : '관리 상태를 확인할 수 없어요.')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const analyzerOk = status?.analyzer?.status === 'ok'
  const productReady =
    imageMode === 'remote' &&
    pipeline === 'product' &&
    Boolean(status?.cashlog?.productAnalyzerConfigured) &&
    analyzerOk

  return (
    <main className="app-shell admin-shell">
      <section className="hero-panel admin-hero">
        <div>
          <p className="eyebrow">Uichan admin</p>
          <h1>Cashlog</h1>
          <p className="hero-copy">
            배포된 앱이 로그인, DB, 상품 사진 분석 서버와 제대로 연결되어 있는지 확인합니다.
          </p>
          <div className="hero-mascots" aria-hidden="true">
            <CatDoodle className="mascot mascot-cat" />
            <DogDoodle className="mascot mascot-dog" />
            <span className="mascot-caption">운영 상태 점검</span>
          </div>
        </div>
        <div className="hero-actions">
          <section className="account-card admin-summary-card" aria-label="관리자 상태 요약">
            <p className="eyebrow">Status</p>
            <h2>{productReady ? '분석 연결 정상' : '점검 필요'}</h2>
            <p>마지막 확인: {formatCheckedAt(status?.checkedAt)}</p>
            <button type="button" className="primary-button" onClick={refresh} disabled={loading}>
              {loading ? '확인 중...' : '다시 확인'}
            </button>
            <a className="ghost-button admin-home-link" href="/">
              앱으로 돌아가기
            </a>
          </section>
        </div>
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
          <AdminRow
            label="Supabase 서버 설정"
            value={status?.cashlog?.supabaseConfigured ? '설정됨' : '미설정'}
            ok={Boolean(status?.cashlog?.supabaseConfigured)}
          />
          <AdminRow
            label="상품 분석 서버"
            value={status?.cashlog?.productAnalyzerOrigin ?? '미설정'}
            ok={Boolean(status?.cashlog?.productAnalyzerConfigured)}
          />
          <AdminRow
            label="Vision fallback"
            value={status?.cashlog?.visionConfigured ? '설정됨' : '미설정'}
            ok={Boolean(status?.cashlog?.visionConfigured)}
          />
          <AdminRow
            label="Vercel 환경"
            value={status?.cashlog?.vercelEnv ?? status?.cashlog?.nodeEnv ?? 'unknown'}
            ok={Boolean(status?.cashlog)}
          />
        </article>

        <article className="admin-card admin-card-wide">
          <div className="section-heading">
            <p className="eyebrow">Analyzer</p>
            <h2>Catai FastAPI</h2>
          </div>
          <AdminRow
            label="Health"
            value={status?.analyzer?.status ?? '확인 전'}
            ok={analyzerOk}
          />
          <AdminRow
            label="HTTP"
            value={status?.analyzer?.httpStatus ? String(status.analyzer.httpStatus) : '-'}
            ok={analyzerOk}
          />
          {status?.analyzer?.error && <p className="admin-error">{status.analyzer.error}</p>}
          {error && <p className="admin-error">{error}</p>}
          <pre className="admin-json">{JSON.stringify(status?.analyzer?.health ?? status, null, 2)}</pre>
        </article>
      </section>
    </main>
  )
}
