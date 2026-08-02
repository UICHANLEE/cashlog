export type AnalyticsEventName =
  | 'page_view'
  | 'view_opened'
  | 'account_panel_opened'
  | 'auth_started'
  | 'auth_succeeded'
  | 'auth_failed'
  | 'camera_opened'
  | 'media_selected'
  | 'analysis_started'
  | 'analysis_succeeded'
  | 'analysis_failed'
  | 'record_saved'
  | 'story_opened'
  | 'pet_interacted'
  | 'pet_customized'
  | 'reservation_submitted'
  | 'profile_updated'
  | 'password_reset_requested'
  | 'password_changed'
  | 'account_deleted'
  | 'client_error'

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>

type QueuedEvent = {
  name: AnalyticsEventName
  occurredAt: string
  path: string
  properties: Record<string, string | number | boolean>
}

const SESSION_KEY = 'cashlog.analytics.session'
const DISABLED_KEY = 'cashlog.analytics.disabled'
const queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false

const randomSessionId = () => {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
  }
}

const getSessionId = () => {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const created = randomSessionId()
    sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return randomSessionId()
  }
}

const isEnabled = () => {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return false
  if (navigator.doNotTrack === '1') return false
  try {
    return localStorage.getItem(DISABLED_KEY) !== '1'
  } catch {
    return true
  }
}

const compactProperties = (properties: AnalyticsProperties) => {
  const output: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') output[key] = value.slice(0, 80)
    else if (typeof value === 'boolean') output[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value
  }
  return output
}

const viewportBucket = () => {
  if (window.innerWidth < 480) return 'compact'
  if (window.innerWidth < 900) return 'medium'
  return 'wide'
}

const deviceKind = () => {
  if (window.innerWidth < 600) return 'mobile'
  if (window.innerWidth < 1024) return 'tablet'
  return 'desktop'
}

const connectionKind = () => {
  const connection = navigator as Navigator & { connection?: { effectiveType?: string } }
  return connection.connection?.effectiveType ?? 'unknown'
}

export const flushAnalytics = async (preferBeacon = false) => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!isEnabled() || queue.length === 0) return
  const events = queue.splice(0, 20)
  const payload = JSON.stringify({ sessionId: getSessionId(), events })
  if (preferBeacon && typeof navigator.sendBeacon === 'function') {
    const accepted = navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }))
    if (accepted) return
  }
  try {
    await fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
  } catch {
    // Analytics must never block the user's primary task.
  }
  if (queue.length > 0) void flushAnalytics()
}

export const trackEvent = (
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
) => {
  if (!isEnabled()) return
  queue.push({
    name,
    occurredAt: new Date().toISOString(),
    path: window.location.pathname,
    properties: compactProperties(properties),
  })
  if (queue.length >= 10) {
    void flushAnalytics()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(() => void flushAnalytics(), 900)
}

export const setAnalyticsEnabled = (enabled: boolean) => {
  try {
    if (enabled) localStorage.removeItem(DISABLED_KEY)
    else localStorage.setItem(DISABLED_KEY, '1')
  } catch {
    return
  }
  if (!enabled) queue.splice(0, queue.length)
  else {
    const needsInitialization = !initialized
    initializeAnalytics()
    if (!needsInitialization) {
      trackEvent('page_view', {
        page: window.location.pathname,
        device: deviceKind(),
        viewport: viewportBucket(),
        connection: connectionKind(),
      })
    }
  }
}

export const isAnalyticsEnabled = () => {
  if (navigator.doNotTrack === '1') return false
  try {
    return localStorage.getItem(DISABLED_KEY) !== '1'
  } catch {
    return true
  }
}

export const initializeAnalytics = () => {
  if (initialized || !isEnabled()) return
  initialized = true
  trackEvent('page_view', {
    page: window.location.pathname,
    device: deviceKind(),
    viewport: viewportBucket(),
    connection: connectionKind(),
  })
  window.addEventListener('error', (event) => {
    trackEvent('client_error', {
      error_name: event.error instanceof Error ? event.error.name : 'Error',
      error_code: 'window_error',
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    trackEvent('client_error', {
      error_name: event.reason instanceof Error ? event.reason.name : 'UnhandledRejection',
      error_code: 'unhandled_rejection',
    })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAnalytics(true)
  })
}
