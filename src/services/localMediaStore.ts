const DATABASE_NAME = 'cashlog-media'
const DATABASE_VERSION = 1
const IMAGE_STORE = 'expense-images'
const KEY_PREFIX = 'local-image:'

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 사진 보관소를 사용할 수 없어요.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('기기 사진 보관소를 열지 못했어요.'))
    request.onblocked = () => reject(new Error('다른 Cashlog 창을 닫고 다시 시도해 주세요.'))
  })

const transact = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE, mode)
    let result: T
    const request = operation(transaction.objectStore(IMAGE_STORE))
    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => {
      transaction.abort()
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onabort = () => {
      database.close()
      reject(new Error('기기 사진 보관 중 오류가 발생했어요.'))
    }
    transaction.onerror = () => {
      database.close()
      reject(new Error('기기 사진 보관 중 오류가 발생했어요.'))
    }
  })
}

export const localImageKey = (expenseId: string) => `${KEY_PREFIX}${expenseId}`

type StoredLocalImage = { bytes: ArrayBuffer; type: string }

const isStoredLocalImage = (value: unknown): value is StoredLocalImage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as StoredLocalImage).type === 'string' &&
  typeof (value as StoredLocalImage).bytes?.byteLength === 'number'

export const createLocalMediaStore = () => ({
  saveImage: async (expenseId: string, image: Blob): Promise<string> => {
    const key = localImageKey(expenseId)
    const storedImage: StoredLocalImage = {
      bytes: await image.arrayBuffer(),
      type: image.type || 'image/jpeg',
    }
    await transact<IDBValidKey>('readwrite', (store) => store.put(storedImage, key))
    return key
  },

  getImage: (key: string): Promise<Blob | null> =>
    transact<StoredLocalImage | undefined>('readonly', (store) => store.get(key)).then((value) =>
      isStoredLocalImage(value) ? new Blob([value.bytes], { type: value.type }) : null,
    ),

  deleteImage: (key: string): Promise<void> =>
    transact<undefined>('readwrite', (store) => store.delete(key)),
})

export type LocalMediaStore = ReturnType<typeof createLocalMediaStore>
