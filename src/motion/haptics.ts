export function signalSoftImpact(durationMs = 8) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

  navigator.vibrate(durationMs)
}
