import { GeometryCleanupError } from './geometryTools'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

let idleWorker: Worker | null = null

/** Termination interrupts synchronous topology work without touching saved drawings. */
export function runCoastlineTask(
  areas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<SaanseoiEstimatedAreas['features']> {
  return new Promise((resolve, reject) => {
    const worker =
      idleWorker ??
      new Worker(new URL('./coastlineWorker.ts', import.meta.url), {
        type: 'module',
      })
    idleWorker = null
    const finish = (reuse = false) => {
      worker.onmessage = null
      worker.onerror = null
      if (reuse) idleWorker = worker
      else worker.terminate()
      signal.removeEventListener('abort', abort)
      clearTimeout(timeout)
    }
    const abort = () => {
      finish()
      reject(new Error('Coastline snapping cancelled. No drawings changed.'))
    }
    const timeout = setTimeout(() => {
      finish()
      reject(
        new Error(
          'Coastline snapping exceeded two minutes. Try a smaller selection. No drawings changed.',
        ),
      )
    }, 120_000)
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = event => {
      finish()
      reject(
        new Error(event.message || 'Coastline worker failed. No drawings changed.'),
      )
    }
    worker.onmessage = event => {
      const result = event.data
      if (result.type === 'progress') progress(result.completed, result.total)
      else {
        finish(result.type === 'complete')
        if (result.type === 'complete') resolve(result.features)
        else if (result.diagnostic) {
          const detail = result.diagnostic
          const error = new GeometryCleanupError(
            detail.level,
            detail.divisionId,
            new Error(result.message),
            detail.contextLabel,
          )
          error.coordinates.splice(0, error.coordinates.length, ...detail.coordinates)
          error.divisionName = detail.divisionName
          error.coordinateRole = detail.coordinateRole
          reject(error)
        } else reject(new Error(result.message))
      }
    }
    if (signal.aborted) abort()
    else worker.postMessage({ areas, inventory })
  })
}
