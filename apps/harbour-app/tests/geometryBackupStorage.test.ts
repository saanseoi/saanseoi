import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveGeometryBackup } from '../src/tools/division-areas/geometryBackupStorage'

afterEach(() => vi.unstubAllGlobals())

describe('geometry backup storage', () => {
  function setup(fail: boolean) {
    const values: Record<string, string> = {
      areas: 'current geometry',
      'areas:before-topology-cleanup': 'undo geometry',
      'areas:topology-backup:1': 'old topology',
      'areas:simplification-backup:2': 'old simplification',
      'another:topology-backup:1': 'unrelated backup',
    }
    const storage = { ...values }
    Object.defineProperties(storage, {
      getItem: { value: (key: string) => storage[key] ?? null },
      removeItem: { value: (key: string) => delete storage[key] },
    })
    const writes = new Map<string, string>()
    const close = vi.fn()
    const transaction: any = {
      error: new DOMException('Quota exceeded', 'QuotaExceededError'),
      objectStore: () => ({
        put: (value: string, key: string) => writes.set(key, value),
      }),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: any = {
          result: {
            close,
            transaction: () => {
              queueMicrotask(() =>
                fail ? transaction.onabort() : transaction.oncomplete(),
              )
              return transaction
            },
          },
        }
        queueMicrotask(() => request.onsuccess())
        return request
      },
    })
    return { storage, values, writes, close }
  }

  it('archives old snapshots before removing them and preserves current work and undo', async () => {
    const { storage, writes, close } = setup(false)
    await archiveGeometryBackup('areas', { features: [] })
    expect(writes.get('areas:topology-backup:1')).toBe('old topology')
    expect(writes.get('areas:simplification-backup:2')).toBe('old simplification')
    expect([...writes.values()]).toContain('{"features":[]}')
    expect(storage).toEqual({
      areas: 'current geometry',
      'areas:before-topology-cleanup': 'undo geometry',
      'another:topology-backup:1': 'unrelated backup',
    })
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves every local snapshot if the archive transaction fails', async () => {
    const { storage, values, close } = setup(true)
    await expect(archiveGeometryBackup('areas', {})).rejects.toMatchObject({
      name: 'QuotaExceededError',
    })
    expect(storage).toEqual(values)
    expect(close).toHaveBeenCalledOnce()
  })
})
