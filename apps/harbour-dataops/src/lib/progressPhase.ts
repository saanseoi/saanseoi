import { OperationProgress } from '../../../harbour-cli/src/lib/cli/operationProgress.ts'

/** Keep long preflight operations visible in terminals and retained logs. */
export async function progressPhase<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  const elapsed = () => `${Math.floor((Date.now() - started) / 1000)}s`
  const progress = new OperationProgress()
  progress.beginPhase(label, {})
  const heartbeat = setInterval(() => {
    progress.message(`${label} — still running (${elapsed()})`)
  }, 15_000)
  try {
    const result = await operation()
    progress.complete(`${label} (${elapsed()})`)
    return result
  } catch (error) {
    progress.error(`${label} failed (${elapsed()})`)
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}
