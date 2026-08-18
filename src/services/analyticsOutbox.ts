export type AnalyticsOutboxEvent = {
  id: string
  name: string
  occurredAt: string
  path: string
  properties: Record<string, string | number | boolean>
}

const DATABASE_NAME = 'cashlog-analytics'
const DATABASE_VERSION = 1
const STORE_NAME = 'events'
const FALLBACK_KEY = 'cashlog.analytics.outbox'
const MAX_EVENTS = 500

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB unavailable'))
    return
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Analytics outbox unavailable'))
})

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) => {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      run(transaction.objectStore(STORE_NAME), resolve, reject)
      transaction.onerror = () => reject(transaction.error ?? new Error('Analytics outbox transaction failed'))
    })
  } finally {
    database.close()
  }
}

const readFallback = (): AnalyticsOutboxEvent[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) as AnalyticsOutboxEvent[] : []
  } catch {
    return []
  }
}

const writeFallback = (events: AnalyticsOutboxEvent[]) => {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
}

export const putAnalyticsEvent = async (event: AnalyticsOutboxEvent) => {
  try {
    await withStore<void>('readwrite', (store, resolve, reject) => {
      const request = store.put(event)
      request.onsuccess = () => {
        const allRequest = store.getAll()
        allRequest.onsuccess = () => {
          const allEvents = allRequest.result as AnalyticsOutboxEvent[]
          const overflow = allEvents
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
            .slice(0, Math.max(0, allEvents.length - MAX_EVENTS))
          for (const item of overflow) store.delete(item.id)
          store.transaction.oncomplete = () => resolve()
        }
        allRequest.onerror = () => reject(allRequest.error)
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    const events = readFallback().filter((item) => item.id !== event.id)
    writeFallback([...events, event])
  }
}

export const readAnalyticsEvents = async (limit = 20): Promise<AnalyticsOutboxEvent[]> => {
  try {
    const events = await withStore<AnalyticsOutboxEvent[]>('readonly', (store, resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as AnalyticsOutboxEvent[])
      request.onerror = () => reject(request.error)
    })
    const merged = new Map<string, AnalyticsOutboxEvent>()
    for (const event of [...events, ...readFallback()]) merged.set(event.id, event)
    return Array.from(merged.values())
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .slice(0, limit)
  } catch {
    return readFallback().slice(0, limit)
  }
}

export const removeAnalyticsEvents = async (ids: string[]) => {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  try {
    await withStore<void>('readwrite', (store, resolve) => {
      for (const id of ids) store.delete(id)
      store.transaction.oncomplete = () => resolve()
    })
  } catch {
    // The fallback is still cleared below.
  }
  try {
    writeFallback(readFallback().filter((event) => !idSet.has(event.id)))
  } catch {
    // Storage can be unavailable in hardened browser modes.
  }
}

export const clearAnalyticsEvents = async () => {
  try {
    await withStore<void>('readwrite', (store, resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Fall through and clear the local fallback as well.
  }
  try {
    localStorage.removeItem(FALLBACK_KEY)
  } catch {
    // Storage can be unavailable in hardened browser modes.
  }
}
