import { afterEach, expect, it, vi } from 'vitest'
import { runCoastlineTask } from '../src/tools/division-areas/coastlineTask'
import { GeometryCleanupError } from '../src/tools/division-areas/geometryTools'

afterEach(() => vi.unstubAllGlobals())

it('restores worker diagnostics so the map can highlight the failing division and node', async () => {
  const terminate = vi.fn()
  class WorkerStub {
    onmessage?: (event: { data: unknown }) => void
    terminate = terminate
    postMessage() {
      this.onmessage?.({
        data: {
          type: 'error',
          message: 'Self-intersection at 114.1836134, 22.4418849.',
          diagnostic: {
            level: 4,
            divisionId: 'affected-division',
            coordinates: [[114.1836134, 22.4418849]],
            contextLabel: 'coastline snap',
            divisionName: 'Affected division',
            coordinateRole: 'failure',
          },
        },
      })
    }
  }
  vi.stubGlobal('Worker', WorkerStub)
  const result = runCoastlineTask(
    {} as Parameters<typeof runCoastlineTask>[0],
    {} as Parameters<typeof runCoastlineTask>[1],
    new AbortController().signal,
    vi.fn(),
  )
  await expect(result).rejects.toBeInstanceOf(GeometryCleanupError)
  await expect(result).rejects.toMatchObject({
    divisionId: 'affected-division',
    coordinates: [[114.1836134, 22.4418849]],
    category: 'coastline snap',
    coordinateRole: 'failure',
  })
  expect(terminate).toHaveBeenCalledOnce()
})
