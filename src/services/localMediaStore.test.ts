import { indexedDB as fakeIndexedDb } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalMediaStore, localImageKey } from './localMediaStore'

const deleteDatabase = () =>
  new Promise<void>((resolve) => {
    const request = fakeIndexedDb.deleteDatabase('cashlog-media')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })

describe('device photo persistence', () => {
  beforeEach(async () => {
    await deleteDatabase()
    vi.stubGlobal('indexedDB', fakeIndexedDb)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await deleteDatabase()
  })

  it('stores the real image bytes and restores them after creating a new store client', async () => {
    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01])], {
      type: 'image/jpeg',
    })
    const key = await createLocalMediaStore().saveImage('expense-1', image)

    expect(key).toBe(localImageKey('expense-1'))
    const restored = await createLocalMediaStore().getImage(key)
    expect(restored).toMatchObject({ size: image.size, type: 'image/jpeg' })

    await createLocalMediaStore().deleteImage(key)
    await expect(createLocalMediaStore().getImage(key)).resolves.toBeNull()
  })
})
