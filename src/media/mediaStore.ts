import type { ExpenseMediaType } from '../domain/cashlog'

const DB_NAME = 'cashlog-media'
const DB_VERSION = 1
const STORE_NAME = 'media'

export type StoredMedia = {
  id: string
  mediaType: ExpenseMediaType
  mediaBlob: Blob
  thumbnailBlob?: Blob
  createdAt: string
}

const canUseIndexedDb = () => typeof indexedDB !== 'undefined'

const openMediaDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB를 사용할 수 없어요.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 열기 실패'))
    request.onsuccess = () => resolve(request.result)
  })

const withMediaStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await openMediaDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청 실패'))
    request.onsuccess = () => resolve(request.result)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('IndexedDB 트랜잭션 실패'))
    }
  })
}

export const saveStoredMedia = async ({
  mediaType,
  mediaBlob,
  thumbnailBlob,
}: {
  mediaType: ExpenseMediaType
  mediaBlob: Blob
  thumbnailBlob?: Blob | null
}) => {
  const item: StoredMedia = {
    id: `media-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    mediaType,
    mediaBlob,
    ...(thumbnailBlob ? { thumbnailBlob } : {}),
    createdAt: new Date().toISOString(),
  }
  await withMediaStore('readwrite', (store) => store.put(item))
  return item
}

export const getStoredMedia = async (id: string) =>
  withMediaStore<StoredMedia | undefined>('readonly', (store) => store.get(id))

export const clearStoredMedia = async () =>
  withMediaStore<undefined>('readwrite', (store) => store.clear())

