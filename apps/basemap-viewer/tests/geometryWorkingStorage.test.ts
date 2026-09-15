import { it, expect, vi, afterEach } from 'vitest'
import { writeGeometryState } from '../src/local-review/division-areas/geometryWorkingStorage'
afterEach(() => vi.unstubAllGlobals())
for (const fail of [false, true])
  it(
    fail
      ? 'keeps legacy drawing and Undo when the transaction aborts'
      : 'stores working drawing and Undo together without localStorage writes',
    async () => {
      const removeItem = vi.fn(),
        setItem = vi.fn(() => {
          throw new DOMException('Full', 'QuotaExceededError')
        })
      vi.stubGlobal('localStorage', { removeItem, setItem })
      const put = vi.fn(),
        close = vi.fn()
      const transaction: any = {
        error: new DOMException('Full', 'QuotaExceededError'),
        objectStore: () => ({ put }),
      }
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
      const operation = writeGeometryState(
        'areas',
        { features: ['new'] },
        { features: ['old'] },
      )
      if (fail) {
        await expect(operation).rejects.toMatchObject({ name: 'QuotaExceededError' })
        expect(removeItem).not.toHaveBeenCalled()
      } else {
        await operation
        expect(put).toHaveBeenCalledWith(
          { current: { features: ['new'] }, undo: { features: ['old'] } },
          'areas',
        )
        expect(removeItem).toHaveBeenCalledTimes(2)
      }
      expect(setItem).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledOnce()
    },
  )
