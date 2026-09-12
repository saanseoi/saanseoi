const TRANSIENT_D1_READ_RETRY_LIMIT = 4
const TRANSIENT_D1_READ_RETRY_DELAY_MS = 50

/** Retries transient failures while reading a local platform binding. */
export async function runWithReadRetry<T>(
  operation: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientReadError(error) || attempt >= TRANSIENT_D1_READ_RETRY_LIMIT) {
      throw error
    }

    await sleep(TRANSIENT_D1_READ_RETRY_DELAY_MS * (attempt + 1))
    return runWithReadRetry(operation, attempt + 1)
  }
}

/** Retries D1 reads that briefly conflict with an import or publish write. */
export const runWithD1ReadRetry = runWithReadRetry

function isTransientReadError(error: unknown) {
  return collectErrorMessages(error).some(message =>
    /sqlite_busy|database is locked|failed to parse body as json, got: error: internal error|d1_error: .*internal error|fetch failed|other side closed/i.test(
      message,
    ),
  )
}

function collectErrorMessages(error: unknown) {
  const messages: string[] = []
  let current: unknown = error
  let depth = 0

  while (current instanceof Error && depth < 8) {
    messages.push(current.message)
    current = current.cause
    depth += 1
  }

  return messages
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
