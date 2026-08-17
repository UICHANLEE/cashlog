import { describe, expect, it } from 'vitest'
import { deriveAnalyticsActionId } from './analytics'

describe('analytics action identifiers', () => {
  it('prefers an explicit stable identifier and never reads button text', () => {
    const button = document.createElement('button')
    button.dataset.analyticsAction = 'record.camera.primary'
    button.textContent = 'user@example.com의 비밀 기록'

    expect(deriveAnalyticsActionId(button)).toBe('record.camera.primary')
  })

  it('uses only the same-origin path for navigation links', () => {
    const link = document.createElement('a')
    link.href = '/login.html?email=user@example.com#private'

    expect(deriveAnalyticsActionId(link)).toBe('navigate:/login.html')
  })

  it('falls back to static element metadata instead of visible content', () => {
    const button = document.createElement('button')
    button.className = 'primary-submit is-loading'
    button.textContent = '민감한 사용자 입력'

    expect(deriveAnalyticsActionId(button)).toBe('button.primary-submit')
  })
})
