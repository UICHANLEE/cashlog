export type AnalyticsEventName =
  | 'page_view'
  | 'page_duration'
  | 'view_opened'
  | 'view_duration'
  | 'first_action'
  | 'action_clicked'
  | 'form_started'
  | 'form_submitted'
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
let listenersBound = false
let pageState: ViewState | null = null
let virtualViewState: ViewState | null = null
let scrollFrame: number | null = null
const startedForms = new WeakSet<HTMLFormElement>()

type ViewState = {
  id: string
  name: string
  scope: 'page' | 'view'
  visibleStartedAt: number | null
  visibleDurationMs: number
  firstActionRecorded: boolean
  actionSequence: number
  maxScrollDepthPct: number
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_.:/-]{0,79}$/i

const monotonicNow = () => typeof performance === 'undefined' ? Date.now() : performance.now()

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

const newViewState = (scope: ViewState['scope'], name: string): ViewState => ({
  id: randomSessionId(),
  name: name.slice(0, 80),
  scope,
  visibleStartedAt: document.visibilityState === 'hidden' ? null : monotonicNow(),
  visibleDurationMs: 0,
  firstActionRecorded: false,
  actionSequence: 0,
  maxScrollDepthPct: readScrollDepth(),
})

const pageName = () => {
  const path = window.location.pathname
  if (path === '/') return 'app'
  return path.replace(/^\//, '').replace(/\.html$/, '') || 'app'
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

function readScrollDepth() {
  const root = document.documentElement
  const scrollable = Math.max(0, root.scrollHeight - window.innerHeight)
  if (scrollable === 0) return 100
  return Math.max(0, Math.min(100, Math.round(window.scrollY / scrollable * 100)))
}

const updateScrollDepth = () => {
  const depth = readScrollDepth()
  if (pageState) pageState.maxScrollDepthPct = Math.max(pageState.maxScrollDepthPct, depth)
  if (virtualViewState) virtualViewState.maxScrollDepthPct = Math.max(virtualViewState.maxScrollDepthPct, depth)
}

const activeInteractionState = () => virtualViewState ?? pageState

const visibleDuration = (state: ViewState, now = monotonicNow()) => {
  const current = state.visibleStartedAt === null ? 0 : Math.max(0, now - state.visibleStartedAt)
  return Math.min(MAX_DURATION_MS, Math.round(state.visibleDurationMs + current))
}

const pauseView = (state: ViewState | null, reason: string) => {
  if (!state || state.visibleStartedAt === null) return
  const now = monotonicNow()
  const segmentDuration = Math.min(MAX_DURATION_MS, Math.max(0, Math.round(now - state.visibleStartedAt)))
  state.visibleStartedAt = null
  state.visibleDurationMs = Math.min(MAX_DURATION_MS, state.visibleDurationMs + segmentDuration)
  if (segmentDuration === 0) return
  trackEvent(state.scope === 'page' ? 'page_duration' : 'view_duration', {
    scope: state.scope,
    view: state.name,
    view_id: state.id,
    duration_ms: segmentDuration,
    total_duration_ms: state.visibleDurationMs,
    scroll_depth_pct: state.maxScrollDepthPct,
    reason,
  })
}

const resumeView = (state: ViewState | null) => {
  if (state && state.visibleStartedAt === null) state.visibleStartedAt = monotonicNow()
}

const safeToken = (value: string | null | undefined) => {
  const candidate = value?.trim()
  return candidate && SAFE_IDENTIFIER.test(candidate) ? candidate : null
}

export const deriveAnalyticsActionId = (element: Element): string | null => {
  const explicit = safeToken(element.getAttribute('data-analytics-action'))
  if (explicit) return explicit

  if (element instanceof HTMLAnchorElement) {
    try {
      const url = new URL(element.href, window.location.href)
      if (url.origin === window.location.origin) {
        const normalizedPath = url.pathname.replace(/[^a-z0-9/._-]/gi, '').slice(0, 68) || '/'
        return `navigate:${normalizedPath}`
      }
    } catch {
      return 'link:invalid'
    }
    return 'link:external'
  }

  const id = safeToken(element.id)
  if (id) return `id:${id}`
  const name = safeToken(element.getAttribute('name'))
  if (name) return `${element.tagName.toLowerCase()}:${name}`

  const stableClasses = Array.from(element.classList)
    .filter((className) => SAFE_IDENTIFIER.test(className) && !/^(is-|has-|active$|selected$|open$)/.test(className))
    .slice(0, 2)
  if (stableClasses.length > 0) return `${element.tagName.toLowerCase()}.${stableClasses.join('.')}`.slice(0, 80)
  if (element instanceof HTMLButtonElement) return `button:${element.type || 'button'}`
  return null
}

const deriveFormId = (form: HTMLFormElement) => {
  const explicit = safeToken(form.getAttribute('data-analytics-form'))
  if (explicit) return explicit
  const id = safeToken(form.id)
  if (id) return `form:${id}`
  const stableClass = Array.from(form.classList).find((className) => SAFE_IDENTIFIER.test(className))
  return stableClass ? `form.${stableClass}`.slice(0, 80) : `form:${pageName()}`
}

const interactionProperties = (state: ViewState, extra: AnalyticsProperties = {}) => ({
  scope: state.scope,
  view: state.name,
  view_id: state.id,
  time_to_action_ms: visibleDuration(state),
  ...extra,
})

const recordAction = (actionId: string, actionType: string) => {
  const state = activeInteractionState()
  if (!state) return
  state.actionSequence += 1
  const actionDetails = {
    action_id: actionId,
    action_type: actionType,
  }
  const firstActionStates = virtualViewState && pageState
    ? [pageState, virtualViewState]
    : [state]
  for (const candidate of firstActionStates) {
    if (candidate.firstActionRecorded) continue
    candidate.firstActionRecorded = true
    trackEvent('first_action', interactionProperties(candidate, {
      ...actionDetails,
      action_sequence: 1,
    }))
  }
  trackEvent('action_clicked', interactionProperties(state, {
    ...actionDetails,
    action_sequence: state.actionSequence,
  }))
}

const bindBehaviorListeners = () => {
  if (listenersBound) return
  listenersBound = true
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const element = event.target.closest('button, a, [role="button"], [data-analytics-action], input[type="button"], input[type="submit"]')
    if (event.target instanceof HTMLInputElement && element instanceof HTMLLabelElement) return
    const disabled = (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.disabled
    if (!element || element.getAttribute('aria-disabled') === 'true' || disabled) return
    const actionId = deriveAnalyticsActionId(element)
    if (actionId) {
      const actionType = element instanceof HTMLAnchorElement
        ? 'link'
        : element instanceof HTMLLabelElement
          ? 'file_picker'
          : 'button'
      recordAction(actionId, actionType)
    }
  }, true)
  document.addEventListener('focusin', (event) => {
    if (!(event.target instanceof Element)) return
    const form = event.target.closest('form')
    if (!(form instanceof HTMLFormElement) || startedForms.has(form)) return
    startedForms.add(form)
    const state = activeInteractionState()
    if (state) trackEvent('form_started', interactionProperties(state, { action_id: deriveFormId(form) }))
  }, true)
  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return
    const state = activeInteractionState()
    if (state) trackEvent('form_submitted', interactionProperties(state, { action_id: deriveFormId(event.target) }))
  }, true)
  window.addEventListener('scroll', () => {
    if (scrollFrame !== null) return
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      updateScrollDepth()
    })
  }, { passive: true })
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
    if (accepted) {
      if (queue.length > 0) void flushAnalytics(true)
      return
    }
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
  if (!enabled) {
    queue.splice(0, queue.length)
    pageState = null
    virtualViewState = null
  }
  else {
    const needsInitialization = !initialized
    initializeAnalytics()
    if (!needsInitialization) {
      pageState = newViewState('page', pageName())
      trackEvent('page_view', {
        page: window.location.pathname,
        scope: 'page',
        view: pageState.name,
        view_id: pageState.id,
        device: deviceKind(),
        viewport: viewportBucket(),
        connection: connectionKind(),
      })
    }
  }
}

export const setAnalyticsView = (view: string) => {
  if (!isEnabled()) return
  const normalized = safeToken(view) ?? 'unknown'
  if (virtualViewState?.name === normalized) return
  pauseView(virtualViewState, 'view_change')
  virtualViewState = newViewState('view', normalized)
  trackEvent('view_opened', {
    scope: 'view',
    view: normalized,
    view_id: virtualViewState.id,
  })
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
  bindBehaviorListeners()
  pageState = newViewState('page', pageName())
  trackEvent('page_view', {
    page: window.location.pathname,
    scope: 'page',
    view: pageState.name,
    view_id: pageState.id,
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
    if (document.visibilityState === 'hidden') {
      updateScrollDepth()
      pauseView(pageState, 'hidden')
      pauseView(virtualViewState, 'hidden')
      void flushAnalytics(true)
    } else {
      resumeView(pageState)
      resumeView(virtualViewState)
    }
  })
  window.addEventListener('pagehide', () => {
    updateScrollDepth()
    pauseView(pageState, 'pagehide')
    pauseView(virtualViewState, 'pagehide')
    void flushAnalytics(true)
  })
  window.addEventListener('pageshow', () => {
    resumeView(pageState)
    resumeView(virtualViewState)
  })
}
