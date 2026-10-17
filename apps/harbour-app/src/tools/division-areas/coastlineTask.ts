import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

/** Termination interrupts synchronous topology work without touching saved drawings. */
export function runCoastlineTask(
  areas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<SaanseoiEstimatedAreas['features']> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./coastlineWorker.ts', import.meta.url), {
      type: 'module',
    })
    const finish = () => {
      worker.terminate()
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
        finish()
        if (result.type === 'complete') resolve(result.features)
        else reject(new Error(result.message))
      }
    }
    if (signal.aborted) abort()
    else worker.postMessage({ areas, inventory })
  })
}
