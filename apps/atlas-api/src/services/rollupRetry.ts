import { isTransientD1Error } from '../lib/d1'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 100

export type RollupPhase = 'analytics_engine_query' | 'd1_write'

export class RollupJobError extends Error {
  constructor(
    readonly phase: RollupPhase,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message)
    this.name = 'RollupJobError'
  }
}

export async function runWithTransientAnalyticsRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return runWithRetry(
    operation,
    error =>
      error instanceof RollupJobError &&
      error.phase === 'analytics_engine_query' &&
      error.httpStatus !== null &&
      (error.httpStatus === 429 || error.httpStatus >= 500),
  )
}

export async function runWithTransientD1WriteRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await runWithRetry(operation, isTransientD1Error)
  } catch (error) {
    throw asRollupJobError('d1_write', error)
  }
}

export function asRollupJobError(phase: RollupPhase, error: unknown) {
  if (error instanceof RollupJobError) return error
  return new RollupJobError(
    phase,
    error instanceof Error ? error.message : 'Unknown roll-up failure',
  )
}

async function runWithRetry<T>(
  operation: () => Promise<T>,
  isTransient: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransient(error) || attempt >= MAX_RETRIES) throw error
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
