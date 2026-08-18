import { indexedDB as fakeIndexedDb } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAnalyticsEvents,
  putAnalyticsEvent,
  readAnalyticsEvents,
  removeAnalyticsEvents,
  type AnalyticsOutboxEvent,
} from './analyticsOutbox'

const deleteDatabase = () => new Promise<void>((resolve) => {
  const request = fakeIndexedDb.deleteDatabase('cashlog-analytics')
  request.onsuccess = () => resolve()
  request.onerror = () => resolve()
  request.onblocked = () => resolve()
})

const event = (id: string, occurredAt: string): AnalyticsOutboxEvent => ({
  id,
  name: 'page_view',
  occurredAt,
  path: '/',
  properties: { release: 'test-release' },
})

describe('analytics outbox', () => {
  beforeEach(async () => {
    await deleteDatabase()
    vi.stubGlobal('indexedDB', fakeIndexedDb)
    localStorage.clear()
  })

  afterEach(async () => {
    await clearAnalyticsEvents()
    vi.unstubAllGlobals()
    await deleteDatabase()
  })

  it('keeps unsent events across store clients and returns them oldest first', async () => {
    await putAnalyticsEvent(event('event_2222222222222222', '2026-08-18T02:00:00.000Z'))
    await putAnalyticsEvent(event('event_1111111111111111', '2026-08-18T01:00:00.000Z'))

    await expect(readAnalyticsEvents()).resolves.toEqual([
      event('event_1111111111111111', '2026-08-18T01:00:00.000Z'),
      event('event_2222222222222222', '2026-08-18T02:00:00.000Z'),
    ])
  })

  it('deduplicates by client event id and removes only acknowledged rows', async () => {
    await putAnalyticsEvent(event('event_1111111111111111', '2026-08-18T01:00:00.000Z'))
    await putAnalyticsEvent(event('event_1111111111111111', '2026-08-18T03:00:00.000Z'))
    await putAnalyticsEvent(event('event_2222222222222222', '2026-08-18T02:00:00.000Z'))

    await removeAnalyticsEvents(['event_1111111111111111'])

    await expect(readAnalyticsEvents()).resolves.toEqual([
      event('event_2222222222222222', '2026-08-18T02:00:00.000Z'),
    ])
  })

  it('merges fallback rows after IndexedDB recovers and clears both stores', async () => {
    const indexedEvent = event('event_1111111111111111', '2026-08-18T01:00:00.000Z')
    const fallbackEvent = event('event_2222222222222222', '2026-08-18T02:00:00.000Z')
    await putAnalyticsEvent(indexedEvent)
    localStorage.setItem('cashlog.analytics.outbox', JSON.stringify([fallbackEvent]))

    await expect(readAnalyticsEvents()).resolves.toEqual([indexedEvent, fallbackEvent])
    await removeAnalyticsEvents([indexedEvent.id, fallbackEvent.id])
    await expect(readAnalyticsEvents()).resolves.toEqual([])
  })
})
