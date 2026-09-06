import { waitForDatasetRecord } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'

export class ControlRequestError extends Error {}

const TRANSIENT_CONTROL_RETRY_LIMIT = 4

const TRANSIENT_CONTROL_RETRY_DELAY_MS = 50

export async function requireDataset(
  db: HarbourReadableDb,
  {
    releaseCode,
    releaseId,
  }: {
    releaseCode?: string
    releaseId?: string
  },
) {
  const dataset = await waitForDatasetRecord(db, {
    releaseCode,
    releaseId,
  })

  if (!dataset) {
    throw new ControlRequestError(
      `Release not found: ${releaseId ?? releaseCode ?? 'unknown'}`,
    )
  }

  return dataset
}

export function isTransientControlError(error: unknown) {
  return collectErrorMessages(error).some(message =>
    /sqlite_busy|database is locked|failed to parse body as json, got: error: internal error|d1_error: .*internal error/i.test(
      message,
    ),
  )
}

export async function runWithTransientControlRetry<T>(
  operation: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientControlError(error) || attempt >= TRANSIENT_CONTROL_RETRY_LIMIT) {
      throw error
    }

    await sleep(TRANSIENT_CONTROL_RETRY_DELAY_MS * (attempt + 1))
    return runWithTransientControlRetry(operation, attempt + 1)
  }
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

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
