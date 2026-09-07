import { log } from '@clack/prompts'

/** Keep long preflight operations visible in terminals and retained logs. */
export async function progressPhase<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  const elapsed = () => `${Math.floor((Date.now() - started) / 1000)}s`
  log.step(label)
  const heartbeat = setInterval(() => {
    log.message(`${label} — still running (${elapsed()})`)
  }, 15_000)
  try {
    const result = await operation()
    log.success(`${label} (${elapsed()})`)
    return result
  } catch (error) {
    log.error(`${label} failed (${elapsed()})`)
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}
